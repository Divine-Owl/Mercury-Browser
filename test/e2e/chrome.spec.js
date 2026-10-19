/*
Runtime facts about the window identity, and the first file of the M1 chrome
suite: later tasks in the plan append the layer, pointer and settings cases here.

The window's identity is unconditional on this branch: `frame: false` and
`transparent: true` are passed to the BaseWindow whatever any setting says, and
`useSeparateTitlebar` no longer exists. The source half of that claim lives in
test/no-separate-titlebar.test.js, because there is no runtime getter for `frame`
at all; this spec is the runtime half - the window that actually opened carries
the transparent background value and still shows the UI.

What the runtime can and cannot see: BaseWindow.getBackgroundColor() in Electron
43.4.1 returns hex and drops the alpha channel (its own type docs say so), so the
transparent `#00000000` reads back as `#000000`. That is still a real regression
guard - the old opaque value was `#fff`, which reads back as `#FFFFFF` - but the
alpha half of the claim stays with the source test rather than being faked here.
*/

const { test, expect } = require('@playwright/test')

const { launchApp, inMain, ensureSettingsPage, openSettingsTab, layerFacts, chromeDom, cdp, pixels, driveWindow, until } = require('./harness.js')

const rgbOf = hex => {
  const value = parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

const rgbString = rgb => `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`

/* The chrome page's own account of the frame: the token main pushed for it, the
   background that follows from it, and where the frame is hittable.

   The token is read rather than a colour hard-coded, because the table in force
   follows the machine's theme - a spec that expected #f6f6f6 would fail on a
   dark desktop, which is exactly how this helper came to exist. */
const framePaint = async app => {
  const paint = await chromeDom(app, `(() => {
    const style = getComputedStyle(document.getElementById('frame'))
    return {
      token: getComputedStyle(document.documentElement).getPropertyValue('--frame-bg').trim(),
      painted: style.backgroundColor,
      radius: style.borderTopLeftRadius,
      backdrop: getComputedStyle(document.body).backgroundColor,
      radius: style.borderTopLeftRadius
    }
  })()`)
  return Object.assign({}, paint, { rgb: rgbOf(paint.token) })
}

test.describe('the window identity', () => {
  let ctx

  test.beforeAll(async () => {
    ctx = await launchApp()
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('the window carries the frameless, transparent background', async () => {
    // Not BaseWindow.getAllWindows()[0]: the app keeps a hidden 'Mercury
    // history service' BrowserWindow (main/main.js's placesWindow), and it is
    // its own BaseWindow, so index 0 is not reliably the browser window. The
    // browser window is the one whose contentView holds the UI page.
    const state = await inMain(ctx.app, ({ BaseWindow }) => {
      const win = BaseWindow.getAllWindows().find(w =>
        (w.contentView ? w.contentView.children : []).some(view =>
          view.webContents && view.webContents.getURL().startsWith('mercury://app/index.html')))
      if (!win) return null
      return {
        background: win.getBackgroundColor(),
        contentBounds: win.getContentBounds()
      }
    })

    expect(state).not.toBeNull()

    // The RGB half of '#00000000'; an opaque '#fff' would come back '#FFFFFF'.
    expect(state.background.toLowerCase()).toBe('#000000')

    // and the window is a real one showing the UI
    expect(state.contentBounds.width).toBeGreaterThan(0)
    expect(state.contentBounds.height).toBeGreaterThan(0)
    expect(ctx.ui.url()).toBe('mercury://app/index.html')
  })

  test('the settings page no longer offers the separate-titlebar toggle', async () => {
    await ensureSettingsPage(ctx)

    const present = await inMain(ctx.app, async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find(w => w.getURL().includes('/pages/settings/'))
      if (!wc) throw new Error('the settings page is not open')
      return wc.executeJavaScript('!!document.getElementById("checkbox-separate-titlebar")')
    })

    expect(present).toBe(false)
  })
})

test.describe('the chrome layer', () => {
  let ctx

  test.beforeAll(async () => {
    ctx = await launchApp()
    // A tab view attaches when the first page loads, and that is the moment the
    // layer has something to be above; without it "last child" would be trivially
    // true. The address editor is still the UI page's at this point in the plan,
    // so this drives it the way a user would.
    await openSettingsTab(ctx.ui, ctx.app)
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('sits above the page, exactly as tall as the frame', async () => {
    const facts = await layerFacts(ctx.app)

    expect(facts.found).toBe(true)
    expect(facts.layer).not.toBeNull()
    expect(facts.layer.bounds).toEqual({ x: 0, y: 0, width: facts.contentWidth, height: 12 })
    expect(facts.layerIsLast).toBe(true)

    // the page below it is really attached: the stacking claim is about a stack
    expect(facts.order.length).toBeGreaterThanOrEqual(3)
  })

  test('paints the frame from the token table the theme selects', async () => {
    const paint = await framePaint(ctx.app)
    const systemDark = await inMain(ctx.app, ({ nativeTheme }) => nativeTheme.shouldUseDarkColors)

    // main pushed the table the theme in force calls for (main/themeMain.js copies
    // nativeTheme.shouldUseDarkColors into darkThemeIsActive, and the layer pushes
    // that setting's table) ...
    expect(paint.token).toBe(systemDark ? '#000000' : '#f6f6f6')
    // ... and the frame is painted with it, not merely handed it
    expect(paint.painted).toBe(rgbString(paint.rgb))

    expect(await chromeDom(ctx.app, 'getComputedStyle(document.getElementById("frame")).height')).toBe('12px')
    expect(paint.radius).toBe('12px') // --r-window, the window's own corner
    expect(await chromeDom(ctx.app, 'document.body.classList.contains("ct-closed")')).toBe(true)
    expect(await chromeDom(ctx.app, 'document.getElementById("island").hidden')).toBe(true)
  })

  test('repaints when the theme setting changes', async () => {
    const startedDark = await inMain(ctx.app, ({ nativeTheme }) => nativeTheme.shouldUseDarkColors)
    const other = startedDark ? '#f6f6f6' : '#000000'

    // Through the path a real theme change takes: the setting, which
    // settingsMain broadcasts and chromeLayer listens for. Nothing here reaches
    // into the layer, so a page that only painted once would fail this.
    await ctx.ui.evaluate(dark => ipc.send('settingChanged', 'darkThemeIsActive', dark), !startedDark)

    await until(async () => (await framePaint(ctx.app)).token === other, {
      what: `the chrome layer to take the ${other} table`
    })
    expect((await framePaint(ctx.app)).painted).toBe(rgbString(rgbOf(other)))

    // and the raster follows the token, so the repaint is real paint and not only
    // a custom property that changed
    const [framePixel] = await pixels(ctx.app, 'pages/chrome/', [{ x: 25, y: 0 }])
    expect({ r: framePixel.r, g: framePixel.g, b: framePixel.b }).toEqual(rgbOf(other))

    await ctx.ui.evaluate(dark => ipc.send('settingChanged', 'darkThemeIsActive', dark), startedDark)
    await until(async () => (await framePaint(ctx.app)).token === (startedDark ? '#000000' : '#f6f6f6'), {
      what: 'the chrome layer to take the original table back'
    })
  })

  test('rounds the window corners over transparency', async () => {
    const paint = await framePaint(ctx.app)

    // The layer is 12px tall, so the corner is read inside its own rows: the arc
    // is centred on (12,12), out of view, so (12,1) and (25,0) are inside it while
    // (0,0) and (1,1) are outside.
    //
    // What the capture can and cannot show: `capturePage()` hands back an opaque
    // bitmap - the page's transparent areas arrive as white, alpha 255 - so
    // "transparent" cannot be read from it and is not read here. What the arc
    // decides is where the frame paints, and that is what these pixels assert:
    // the corner is not frame paint, a few pixels in it is.
    const [corner, diagonal, insideArc, alongTopRow] = await pixels(ctx.app, 'pages/chrome/', [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 12, y: 1 },
      { x: 25, y: 0 }
    ])

    expect({ r: insideArc.r, g: insideArc.g, b: insideArc.b }).toEqual(paint.rgb)
    expect(insideArc.a).toBe(255)
    expect({ r: alongTopRow.r, g: alongTopRow.g, b: alongTopRow.b }).toEqual(paint.rgb)

    expect({ r: corner.r, g: corner.g, b: corner.b }).not.toEqual(paint.rgb)
    expect({ r: diagonal.r, g: diagonal.g, b: diagonal.b }).not.toEqual(paint.rgb)

    // And the page itself paints nothing behind that shape, which is the half
    // that lets the window's own transparency (the identity group's case, and
    // test/no-separate-titlebar.test.js) show through. Hit testing is not part of
    // this and is not asserted: Chromium hit-tests the frame's box, not its
    // rounded shape, so the see-through corner still drags the window - true of
    // every rounded transparent window, and not something this milestone changes.
    expect(paint.backdrop).toBe('rgba(0, 0, 0, 0)')
  })
})

test.describe('the island reveals', () => {
  let ctx

  // The layer's height and the page's own account of the state it was told to
  // show. Both halves matter: a height without the class would be a box that is
  // 77 px tall and painting the closed chrome.
  const chromeBox = async app => {
    const facts = await layerFacts(app)
    const dom = await chromeDom(app, `({
      open: document.body.classList.contains('ct-open'),
      islandHidden: document.getElementById('island').hidden
    })`)
    return { height: facts.layer ? facts.layer.bounds.height : null, ...dom }
  }

  test.beforeAll(async () => {
    ctx = await launchApp()
    // A tab view, not the UI page: the preload that reports the page's pointer
    // rides on tab views (main/viewManager.js), and the settings page is the one
    // this suite can open without a network.
    await openSettingsTab(ctx.ui, ctx.app)
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('opens when the pointer enters the frame band', async () => {
    expect((await chromeBox(ctx.app)).height).toBe(12)

    await driveWindow(ctx.app, { op: 'focus' })
    await cdp(ctx.app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 120, y: 6 } }
    ])

    await until(async () => (await chromeBox(ctx.app)).height === 77, { what: 'the chrome box to open' })

    const opened = await chromeBox(ctx.app)
    expect(opened.open).toBe(true)
    expect(opened.islandHidden).toBe(false)
  })

  test('closes when the pointer reports from below the box', async () => {
    // Opens it here rather than relying on the case above: on its own, "the box
    // is closed" would be true before any implementation existed.
    await driveWindow(ctx.app, { op: 'focus' })
    await cdp(ctx.app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 120, y: 6 } }
    ])
    await until(async () => (await chromeBox(ctx.app)).height === 77, { what: 'the chrome box to open' })

    await cdp(ctx.app, 'pages/settings/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 120, y: 400 } }
    ])

    await until(async () => (await chromeBox(ctx.app)).height === 12, { what: 'the chrome box to close' })

    const closed = await chromeBox(ctx.app)
    expect(closed.open).toBe(false)
    expect(closed.islandHidden).toBe(true)
  })

  test('closes when the window loses focus', async () => {
    await cdp(ctx.app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 120, y: 6 } }
    ])
    await until(async () => (await chromeBox(ctx.app)).height === 77, { what: 'the chrome box to open again' })

    // Emitted, not blurred: with no window manager behind the test display,
    // win.blur() leaves the window focused and fires nothing (measured), so the
    // real event cannot be produced here. This proves the handler is registered
    // and that the rule's answer is applied to the layer; the rule itself - an
    // open box closes, a closed one is left alone - is test/chromeReveal.test.js's.
    await driveWindow(ctx.app, { op: 'emit', event: 'blur' })

    await until(async () => (await chromeBox(ctx.app)).height === 12, { what: 'the blur to close the box' })
  })
})
