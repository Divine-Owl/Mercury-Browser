/* The chrome layer: Mercury's own chrome, drawn by a WebContentsView stacked above
   every tab view (§4.1).

   Main owns the layer and is the only party that sizes it: boxHeight(state) from
   the shared token module, positioned at the top-left of the window's content,
   and the page is told which state it is in. The page paints what it is told and
   owns nothing else; every fact it shows arrives in a message, and every command
   it sends goes back through main to the UI page, which still owns the tabs.

   Why the page cannot own its own geometry: the layer is a native view, so only
   main can move it, and the page's own layout cannot know how tall the box is -
   the box grows downward over the page, and the page below is a different
   native view entirely. Keeping the height in one function here is what makes
   "the box is exactly as tall as the chrome it shows" true by construction. */

/* global ipc, windows, settings, WebContentsView, chromeTokens, chromeSettings, chromeReveal, getView, getWindowFromViewContents */

const CHROME_PAGE_URL = 'mercury://app/pages/chrome/index.html'

/* Per-window chrome state, kept out of windows.getState() so the window manager
   does not have to know this module exists. A WeakMap because a window's entry
   must not outlive the window. */
const chromeLayers = new WeakMap()

const chromeLayer = {
  pageURL: CHROME_PAGE_URL,

  /* Called from createWindowWithBounds after mainView is attached and before
     windows.addWindow, so the layer shares mainView's --window-id argument. */
  create: function (win, additionalArguments) {
    if (chromeLayers.has(win)) {
      return
    }

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        additionalArguments: additionalArguments
      }
    })

    const bounds = win.getContentBounds()
    view.setBounds({ x: 0, y: 0, width: bounds.width, height: chromeTokens.frameHeight })

    chromeLayers.set(win, { view, state: 'closed' })
    win.contentView.addChildView(view)

    // the layer is per-window: the window's death is its death, and nothing else
    // destroys it (windows.addWindow detaches it on 'close', which is why this
    // cannot rely on the view's parent to tear the webContents down)
    win.on('closed', function () {
      chromeLayer.destroy(win)
    })

    /* A blur is not the pointer leaving - it is the window no longer being what
       the user is looking at, and an open box has no business staying open behind
       another window (§4.6). */
    win.on('blur', function () {
      revealFrom(win, { source: 'blur' })
    })

    view.webContents.loadURL(CHROME_PAGE_URL)
  },

  destroy: function (win) {
    const layer = chromeLayers.get(win)
    if (!layer) {
      return
    }
    chromeLayers.delete(win)
    if (!layer.view.webContents.isDestroyed()) {
      layer.view.webContents.destroy()
    }
  },

  view: function (win) {
    return chromeLayers.get(win)?.view || null
  },

  /* For windows.windowFromContents: an IPC sender is this window's if it is the
     window's chrome layer. */
  hasContents: function (win, webContentsId) {
    const layer = chromeLayers.get(win)
    return !!(layer && !layer.view.webContents.isDestroyed() &&
      layer.view.webContents.id === webContentsId)
  },

  /* Whatever attached a tab view removed everything above mainView first, so the
     layer is put back last. Cheap and self-healing: it only touches the tree when
     the order is actually wrong. */
  raise: function (win) {
    const layer = chromeLayers.get(win)
    if (!layer || layer.view.webContents.isDestroyed()) {
      return
    }
    const content = win.getContentView()
    if (content.children[content.children.length - 1] !== layer.view) {
      content.removeChildView(layer.view)
      content.addChildView(layer.view)
    }
  },

  state: function (win) {
    return chromeLayers.get(win)?.state || 'closed'
  },

  setState: function (win, state) {
    const layer = chromeLayers.get(win)
    if (!layer || layer.state === state) {
      return
    }
    layer.state = state
    chromeLayer.updateGeometry(win)
  },

  /* The one place the layer's bounds are computed. Every caller is a resize, a
     state change, or the page's own handshake - never the page's layout. */
  updateGeometry: function (win) {
    const layer = chromeLayers.get(win)
    if (!layer || layer.view.webContents.isDestroyed()) {
      return
    }

    const height = chromeTokens.boxHeight(layer.state)
    const bounds = win.getContentBounds()
    layer.view.setBounds({ x: 0, y: 0, width: bounds.width, height: height })

    chromeLayer.send(win, 'chrome-geom', { state: layer.state, boxH: height })
  },

  send: function (win, channel, data) {
    const layer = chromeLayers.get(win)
    if (!layer || layer.view.webContents.isDestroyed()) {
      return
    }
    layer.view.webContents.send(channel, data)
  },

  /* The tokens as the page's custom properties, with the one setting that is a
     chrome length - the page radius the frame's hairline is inset by (§4.7). */
  pushTokens: function (win) {
    const dark = !!settings.get('darkThemeIsActive')
    const tokens = Object.assign({}, dark ? chromeTokens.dark : chromeTokens.light)
    tokens['--r-page'] = chromeSettings.pageCornerRadius.clamp(settings.get('pageCornerRadius')) + 'px'
    chromeLayer.send(win, 'chrome-tokens', { dark, tokens })
  }
}

/* §4.6's decision, applied: a report comes in, the pure rule answers, and the box
   moves if the answer is not 'stay'. The rule owns what the state should be and
   this owns asking it, so neither side guesses at the other's business. */
function revealFrom (win, report) {
  const next = chromeReveal.next(chromeLayer.state(win), {
    source: report.source,
    y: report.y,
    frameHeight: chromeTokens.frameHeight,
    tolerance: chromeSettings.hoverTolerance.clamp(settings.get('hoverTolerance'))
  })
  if (next !== 'stay') {
    chromeLayer.setState(win, next)
  }
}

/* The chrome's own pointer. The layer starts at the window's top-left corner, so
   its page's coordinates are already the window's. */
ipc.on('chrome-pointer', function (e, report) {
  const win = windows.windowFromContents(e.sender)?.win
  if (win) {
    revealFrom(win, { source: 'chrome', y: report.y })
  }
})

/* The page's pointer, which is in the page's own coordinates: the view's offset
   is what turns it into a window coordinate. A view that is not attached reports
   from y = 0, which is the frame band - and a report from a view that is not on
   screen cannot be about the pointer leaving the chrome, since the view is not
   what the pointer is over. */
ipc.on('page-pointer', function (e, report) {
  const win = getWindowFromViewContents(e.sender)
  if (!win) {
    return
  }
  const view = getView(windows.getState(win).selectedView)
  const viewBounds = (view && view.getBounds()) || { y: 0 }
  revealFrom(win, { source: 'page', y: viewBounds.y + report.y })
})

/* The page announces itself once its bundle has run, which is the earliest moment
   a push can be delivered; pushing in `create` would race the page's own
   listeners. */
ipc.on('chrome-ready', function (e) {
  const win = windows.windowFromContents(e.sender)?.win
  if (!win) {
    return
  }
  chromeLayer.pushTokens(win)
  chromeLayer.updateGeometry(win)
})

settings.listen('darkThemeIsActive', function () {
  windows.getAll().forEach(function (win) {
    chromeLayer.pushTokens(win)
  })
})
