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

const { launchApp, inMain, ensureSettingsPage, openSettingsTab, layerFacts, viewFacts, chromeDom, cdp, pixels, driveWindow, focusContents, newTab, until, webContentsList, openAddressBar, enterUrl, addressInput, pressEnter, pressEscape, setPageCornerRadius, SHORT_SETTINGS_URL, SHORT_NEWTAB_URL, SETTINGS_PAGE, UI_URL } = require('./harness.js')

const rgbOf = hex => {
  const value = parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

// The same, for a computed style's "rgb(r, g, b)" - which is how a page reports
// its own background, and how it has to be read: the settings page follows the
// machine's theme, so a colour hard-coded here would be a test that passes on
// one desktop and fails on another.
const rgbOfCss = value => {
  const parts = String(value).match(/\d+/g) || []
  return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]) }
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
    // the island's closed state: out of the page, not merely un-drawn, so it can
    // drop in when body.ct-open arrives instead of appearing (§4.12)
    expect(await chromeDom(ctx.app, 'getComputedStyle(document.getElementById("island")).visibility')).toBe('hidden')
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
    // a custom property that changed. Waited for rather than read once: a capture
    // is the last frame the view presented, and a style change is not a frame
    // until the compositor has drawn one - reading immediately can return the
    // colour the page had before.
    const expected = rgbOf(other)
    await until(async () => {
      const [px] = await pixels(ctx.app, 'pages/chrome/', [{ x: 25, y: 0 }])
      return px.r === expected.r && px.g === expected.g && px.b === expected.b
    }, { what: `the frame's pixels to take ${other}` })

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
  // 79 px tall and painting the closed chrome.
  const chromeBox = async app => {
    const facts = await layerFacts(app)
    const dom = await chromeDom(app, `({
      open: document.body.classList.contains('ct-open'),
      islandVisible: getComputedStyle(document.getElementById('island')).visibility === 'visible'
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
    await focusContents(ctx.app, 'pages/chrome/')
    await cdp(ctx.app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 120, y: 6 } }
    ])

    await until(async () => (await chromeBox(ctx.app)).height === 79, { what: 'the chrome box to open' })

    const opened = await chromeBox(ctx.app)
    expect(opened.open).toBe(true)
    expect(opened.islandVisible).toBe(true)
  })

  test('closes when the pointer reports from below the box', async () => {
    // Opens it here rather than relying on the case above: on its own, "the box
    // is closed" would be true before any implementation existed.
    await driveWindow(ctx.app, { op: 'focus' })
    await focusContents(ctx.app, 'pages/chrome/')
    await cdp(ctx.app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 120, y: 6 } }
    ])
    await until(async () => (await chromeBox(ctx.app)).height === 79, { what: 'the chrome box to open' })

    await focusContents(ctx.app, 'pages/settings/')
    await cdp(ctx.app, 'pages/settings/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 120, y: 400 } }
    ])

    await until(async () => (await chromeBox(ctx.app)).height === 12, { what: 'the chrome box to close' })

    const closed = await chromeBox(ctx.app)
    expect(closed.open).toBe(false)
    expect(closed.islandVisible).toBe(false)
  })

  test('closes when the window loses focus', async () => {
    await driveWindow(ctx.app, { op: 'focus' })
    await focusContents(ctx.app, 'pages/chrome/')
    await cdp(ctx.app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 120, y: 6 } }
    ])
    await until(async () => (await chromeBox(ctx.app)).height === 79, { what: 'the chrome box to open again' })

    // Emitted, not blurred: with no window manager behind the test display,
    // win.blur() leaves the window focused and fires nothing (measured), so the
    // real event cannot be produced here. This proves the handler is registered
    // and that the rule's answer is applied to the layer; the rule itself - an
    // open box closes, a closed one is left alone - is test/chromeReveal.test.js's.
    await driveWindow(ctx.app, { op: 'emit', event: 'blur' })

    await until(async () => (await chromeBox(ctx.app)).height === 12, { what: 'the blur to close the box' })
  })

  test('lifts the island off the frame with its own surface', async () => {
    await driveWindow(ctx.app, { op: 'focus' })
    await focusContents(ctx.app, 'pages/chrome/')
    await cdp(ctx.app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 120, y: 6 } }
    ])
    await until(async () => (await chromeBox(ctx.app)).height === 79, { what: 'the chrome box to open' })

    const surface = await chromeDom(ctx.app, `(() => {
      const style = getComputedStyle(document.getElementById('island'))
      return {
        token: getComputedStyle(document.documentElement).getPropertyValue('--island-bg').trim(),
        painted: style.backgroundColor,
        border: style.borderTopColor,
        radius: style.borderTopLeftRadius,
        shadow: style.boxShadow
      }
    })()`)

    // §4.8: the island's surface is not the frame's colour, and it is painted with
    // the token it was handed rather than merely handed it
    const frame = await framePaint(ctx.app)
    expect(surface.token).not.toBe(frame.token)
    expect(surface.painted).toBe(rgbString(rgbOf(surface.token)))

    // the other two halves of the lift, and the capsule's radius (half of the
    // 53 px island, which the token table expresses as calc(--island-h / 2))
    expect(surface.border).not.toBe('rgba(0, 0, 0, 0)')
    expect(surface.shadow).not.toBe('none')
    expect(surface.radius).toBe('26.5px')

    // and the raster agrees. The island drops in over §4.12's 140 ms, so the layout
    // is waited for first: a capture is the last frame the view presented, and a
    // read taken during the transition reads the frame from before it.
    await until(async () => {
      const height = await chromeDom(ctx.app, 'document.getElementById("island").getBoundingClientRect().height')
      return Math.abs(height - 53) < 0.5
    }, { what: 'the island to finish dropping in' })

    const { layer } = await layerFacts(ctx.app)
    const expected = rgbOf(surface.token)
    await until(async () => {
      const [px] = await pixels(ctx.app, 'pages/chrome/', [{ x: Math.round(layer.bounds.width / 2), y: 22 }])
      return px.r === expected.r && px.g === expected.g && px.b === expected.b
    }, { what: 'the island’s pixels to take its own surface colour' })

    // The box is taller than frame + gap + island by the room the shadow paints
    // in; without it the box's edge cuts the shadow off under the island.
    expect((await chromeBox(ctx.app)).height).toBe(79)
  })
})

test.describe('the strip', () => {
  let ctx

  /* What each pill is and how it is drawn. The hit box and the bar are separate
     measurements on purpose: §4.3 makes the press target the row's full height
     while 4 px is all that is painted, and a spec that read only one of them
     would accept a 4 px target. */
  const pills = app => chromeDom(app, `Array.from(document.querySelectorAll('#strip .pill')).map(pill => {
    const bar = pill.querySelector('.pill-bar')
    const rect = pill.getBoundingClientRect()
    return {
      id: pill.dataset.tabId,
      role: pill.getAttribute('role'),
      selected: pill.getAttribute('aria-selected'),
      title: pill.title,
      bar: bar ? getComputedStyle(bar).backgroundColor : null,
      hitHeight: rect.height,
      barHeight: bar ? bar.getBoundingClientRect().height : null
    }
  })`)

  test.beforeAll(async () => {
    ctx = await launchApp()
    // The first publish can be earlier than the chrome page's bundle, which is
    // why the layer keeps the last summary and re-sends it on chrome-ready; this
    // waits for the result rather than assuming an order.
    await until(async () => (await pills(ctx.app)).length > 0, { what: 'the strip to show its first pill' })
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('shows one pill per tab, in tab order', async () => {
    const [first] = await pills(ctx.app)

    expect(first.role).toBe('tab')
    expect(first.selected).toBe('true')
    expect(first.id).toMatch(/^\d+$/) // tab ids are numeric strings, never numbers
    expect(first.bar).not.toBe('rgba(0, 0, 0, 0)')

    await newTab(ctx.app)
    await until(async () => (await pills(ctx.app)).length === 2, { what: 'the second tab’s pill' })

    const [older, newer] = await pills(ctx.app)
    expect(older.id).toBe(first.id) // the new tab lands after the old one, not before
    expect(newer.id).not.toBe(first.id)
    expect(newer.selected).toBe('true') // a tab opened from the menu is the selected one
    expect(older.selected).toBe('false')
  })

  test('gives the pill the row’s height and paints a bar inside it', async () => {
    // The case above opened the box by opening a tab (§4.11: a new tab asks for the
    // pill), and the strip lives inside the island while it is out. Closing it is
    // what a user does, and it is what puts the strip back in the frame, where these
    // two numbers are the frame's.
    await driveWindow(ctx.app, { op: 'emit', event: 'blur' })
    await until(async () => !(await chromeDom(ctx.app, 'document.body.classList.contains("ct-open")')), {
      what: 'the box to close'
    })

    const [first] = await pills(ctx.app)

    expect(first.hitHeight).toBe(12) // the frame's height: the press target
    expect(first.barHeight).toBe(4) // --pill-h-frame: what is drawn
  })

  test('paints a taller bar inside the island, whose row is taller', async () => {
    await openAddressBar(ctx.ui, ctx.app)

    // The island drops in over §4.12's 140 ms, and a bar measured mid-transition
    // is a bar measured at the wrong scale.
    await until(async () => (await pills(ctx.app))[0].barHeight === 16, {
      what: 'the island’s pill bar to settle at 16 px'
    })

    const [first] = await pills(ctx.app)

    expect(first.barHeight).toBe(16) // --pill-h-island: §4.3's separate token
    expect(first.hitHeight).toBeGreaterThan(12) // the island's row, not the frame's
  })

  test('switches tabs when a pill is clicked', async () => {
    const [firstPill] = await pills(ctx.app)
    expect(firstPill.selected).toBe('false') // the tab the case above opened is active

    const at = await chromeDom(ctx.app, `(() => {
      const rect = document.querySelector('#strip .pill').getBoundingClientRect()
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
    })()`)

    await driveWindow(ctx.app, { op: 'focus' })
    await focusContents(ctx.app, 'pages/chrome/')
    await cdp(ctx.app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 } },
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 } }
    ])

    await until(async () => (await pills(ctx.app))[0].selected === 'true', { what: 'the first pill to become active' })

    // and the tab state agrees, which is the half that proves the command
    // travelled: the pill's id is a string, so a message that turned it into a
    // number would reach nothing and leave the selection where it was
    expect(await ctx.ui.evaluate(() => tabs.getSelected())).toBe(firstPill.id)
  })

  test('paints the active pill differently from the others', async () => {
    const [active, inactive] = await pills(ctx.app)

    expect(active.selected).toBe('true')
    expect(inactive.selected).toBe('false')
    expect(active.bar).not.toBe(inactive.bar)
  })
})

/* The island's address pill (§4.4). This suite drives it the way a user does -
   a press on the pill, text, Enter or Escape - because the pill is in the chrome
   layer and only CDP input reaches it. */
test.describe('the address pill', () => {
  let ctx

  /* The webContents holding the input focus, which is what proves the pill had
     it (and that the page got it back). */
  const focusedUrl = app => inMain(app, ({ webContents }) => {
    const wc = webContents.getFocusedWebContents()
    return wc ? wc.getURL() : null
  })

  test.beforeAll(async () => {
    ctx = await launchApp()
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('types a URL into the pill and navigates', async () => {
    // The rewritten helper is this case's own proof: it is the path a user takes,
    // from a closed chrome to a page rendered in a tab.
    await enterUrl(ctx.ui, ctx.app, SHORT_SETTINGS_URL)

    await until(
      async () => (await webContentsList(ctx.app)).find(wc => wc.url === SETTINGS_PAGE),
      { what: `${SHORT_SETTINGS_URL} to render as ${SETTINGS_PAGE}`, timeout: 30000 }
    )
  })

  test('holds the focus while the island is open, and hands it to the page after Enter', async () => {
    await openAddressBar(ctx.ui, ctx.app)
    expect(await focusedUrl(ctx.app)).toContain('pages/chrome/index.html')

    await enterUrl(ctx.ui, ctx.app, SHORT_SETTINGS_URL)
    await until(
      async () => (await webContentsList(ctx.app)).find(wc => wc.url === SETTINGS_PAGE),
      { what: 'the page to render in a tab' }
    )

    await until(async () => (await focusedUrl(ctx.app)) !== null &&
      !(await focusedUrl(ctx.app)).includes('pages/chrome/'), { what: 'the focus to leave the chrome layer' })
  })

  test('Escape cancels what was typed and changes nothing', async () => {
    await openAddressBar(ctx.ui, ctx.app)
    const before = (await webContentsList(ctx.app)).map(wc => wc.url).sort()

    await addressInput(ctx.ui, ctx.app, 'http://example.com/should-not-open')
    await pressEscape(ctx.app) // cancels the edit
    await pressEscape(ctx.app) // retracts

    await until(async () => !(await chromeDom(ctx.app, 'document.body.classList.contains("ct-open")')), {
      what: 'the box to close'
    })

    const after = (await webContentsList(ctx.app)).map(wc => wc.url).sort()
    expect(after).toEqual(before)
  })

  test('shows the page it is resting on', async () => {
    // The chrome page is still loading when this suite starts, so the pill is
    // waited for rather than read on the first try.
    await until(async () => chromeDom(ctx.app, '!!document.getElementById("address-input")'), {
      what: 'the chrome page to have its address pill'
    })

    const paint = await chromeDom(ctx.app, `({
      value: document.getElementById('address-input').value,
      title: document.getElementById('address').title
    })`)

    // the domain at rest, the full URL as the tooltip - both from the active tab
    expect(paint.value.length).toBeGreaterThan(0)
    expect(paint.title.length).toBeGreaterThan(0)
    expect(paint.value).not.toContain('://')
  })
})

/* Task 8's two boundary criteria. SC3: the viewport starts at the frame's bottom
   edge. SC4: the page below the frame takes pointer input unchanged - which is
   only true once nothing else is laid over the page's first rows. */
test.describe('the viewport and the page below the frame', () => {
  let ctx

  const settingsView = async app => {
    const facts = await viewFacts(app)
    const view = facts.views.find(v => v.url && v.url.includes('/pages/settings/'))
    if (!view) throw new Error('the settings page is not a view of this window')
    return { view, content: facts.content }
  }

  /* A click counter and a scroll position in the settings page's own context, so
     the assertion is about the page and not about anything above it. */
  const instrument = app => inMain(app, ({ webContents }) => {
    const wc = webContents.getAllWebContents().find(w => w.getURL().includes('/pages/settings/'))
    if (!wc) throw new Error('the settings page is not open')
    return wc.executeJavaScript(
      'window.clicks = 0;' +
      'document.addEventListener("click", function () { window.clicks++ });' +
      'window.scrollY'
    )
  })

  const readFromSettings = (app, expression) => inMain(app, ({ webContents }, expression) => {
    const wc = webContents.getAllWebContents().find(w => w.getURL().includes('/pages/settings/'))
    return wc.executeJavaScript(expression)
  }, expression)

  test.beforeAll(async () => {
    ctx = await launchApp()
    await openSettingsTab(ctx.ui, ctx.app)
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('the tab view starts at the frame’s bottom edge', async () => {
    const { view, content } = await settingsView(ctx.app)

    /* The layer's own bottom row is its hairline, so this is geometry rather than a
       see-through pixel - a capture cannot show that nothing overlaps the page's
       first row, and the bounds can. */
    expect(view.bounds).toEqual({ x: 0, y: 12, width: content.width, height: content.height - 12 })
  })

  test('the page takes clicks and wheels in the rows below the frame', async () => {
    await instrument(ctx.app)

    await driveWindow(ctx.app, { op: 'focus' })
    await focusContents(ctx.app, 'pages/settings/')

    /* View y = 20 is window y = 32: below the frame's 12 px. The geometry case above
       is what makes that row the page's - before the swap the tab view starts at the
       old navbar's bottom, and the rows under the frame belong to the UI page. */
    await cdp(ctx.app, 'pages/settings/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 200, y: 20, button: 'left', clickCount: 1 }},
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: 200, y: 20, button: 'left', clickCount: 1 }}
    ])

    await until(async () => (await readFromSettings(ctx.app, 'window.clicks')) === 1, {
      what: 'the page to receive the click'
    })

    // and the wheel, which is the half of SC4 that touches the chrome layer's absence.
    // This page scrolls its body rather than the viewport, so that is what is read.
    const before = await readFromSettings(ctx.app, 'document.body.scrollTop')
    await cdp(ctx.app, 'pages/settings/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: 200, y: 20, deltaX: 0, deltaY: 120 }}
    ])
    await until(async () => (await readFromSettings(ctx.app, 'document.body.scrollTop')) > before, {
      what: 'the page to scroll'
    })
  })

  test('leaves the covered chrome unreachable', async () => {
    await driveWindow(ctx.app, { op: 'focus' })
    await focusContents(ctx.app, 'pages/settings/')

    await cdp(ctx.app, 'pages/settings/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 200, y: 18, button: 'left', clickCount: 1 }},
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: 200, y: 18, button: 'left', clickCount: 1 }}
    ])

    /* A press in the page's own rows. The old editor is under the tab view, and the
       geometry above is what makes that true: a press here cannot reach it. */
    await new Promise(r => setTimeout(r, 300))
    const editor = await ctx.ui.evaluate(() => ({
      hidden: document.getElementById('tab-editor').hidden,
      editMode: document.body.classList.contains('is-edit-mode')
    }))

    expect(editor.hidden).toBe(true)
    expect(editor.editMode).toBe(false)
  })
})

/* Task 7: the island's third element - back, forward, reload, the menu, and the
   window buttons. Each is an icon button whose state it carries on itself, because
   the chrome layer is not a Playwright page: `data-action` is what a press asks for
   and `data-label` is the state it is in (maximize vs restore). */
test.describe('the island’s controls', () => {
  let ctx

  /* A press on a control in the chrome layer: the layer is a view, not a page, so
     the press goes through CDP at the control's centre. */
  const clickControl = async (app, id) => {
    const at = await chromeDom(app, `(() => {
      const rect = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect()
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
    })()`)

    await driveWindow(app, { op: 'focus' })
    await focusContents(app, 'pages/chrome/')
    await cdp(app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 }},
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }}
    ])
  }

  /* The browser window, which is not BaseWindow.getAllWindows()[0] - the app keeps
     a hidden history-service window in that list on every run. The URL is spelled
     out because this function runs in the main process, where the harness's own
     scope is not. */
  const windowState = (app, state) => inMain(app, ({ BaseWindow }, state) => {
    const win = BaseWindow.getAllWindows().find(w =>
      (w.contentView ? w.contentView.children : []).some(view =>
        view.webContents && view.webContents.getURL() === 'mercury://app/index.html'))
    if (!win) return null
    if (state === 'maximized') return win.isMaximized()
    if (state === 'minimized') return win.isMinimized()
    return null
  }, state)

  test.beforeAll(async () => {
    ctx = await launchApp()
    // the settings page, so a press has somewhere to land and a history to grow
    await openSettingsTab(ctx.ui, ctx.app)
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('starts with nothing to go back or forward to', async () => {
    await openAddressBar(ctx.ui, ctx.app)

    const nav = await chromeDom(ctx.app, `({
      back: document.getElementById('back-button').disabled,
      forward: document.getElementById('forward-button').disabled
    })`)

    expect(nav.back).toBe(true)
    expect(nav.forward).toBe(true)
  })

  test('enables back once there is somewhere to go back to, and goes back', async () => {
    await enterUrl(ctx.ui, ctx.app, SHORT_SETTINGS_URL)
    await enterUrl(ctx.ui, ctx.app, SHORT_NEWTAB_URL)

    await openAddressBar(ctx.ui, ctx.app)

    // The history answers after the navigation commits, so the button is waited for
    // rather than read once.
    await until(async () => !(await chromeDom(ctx.app, 'document.getElementById("back-button").disabled')), {
      what: 'the back button to be enabled'
    })

    const nav = await chromeDom(ctx.app, `({
      back: document.getElementById('back-button').disabled,
      forward: document.getElementById('forward-button').disabled
    })`)

    expect(nav.back).toBe(false) // the settings page is behind this one
    expect(nav.forward).toBe(true) // nothing ahead of it

    await clickControl(ctx.app, 'back-button')

    await until(
      async () => (await webContentsList(ctx.app)).some(wc => wc.url === SETTINGS_PAGE),
      { what: 'the tab to go back to the settings page' }
    )
  })

  test('shows reload, and the maximise button follows the window', async () => {
    await openAddressBar(ctx.ui, ctx.app)

    expect(await chromeDom(ctx.app, 'document.getElementById("reload-button").dataset.action')).toBe('reload')

    /* Which of the two the button offers depends on the window's own state, and a
       display with no window manager starts the window maximised (it is bigger
       than the screen) - so the test asks the button to change its state rather
       than assuming where it started. */
    const label = () => chromeDom(ctx.app, 'document.getElementById("maximize-button").dataset.state')
    const before = await label()

    await clickControl(ctx.app, 'maximize-button')
    await until(async () => await label() !== before, {
      what: 'the maximise button to change its state'
    })
    expect(await label()).toBe(before === 'maximize' ? 'restore' : 'maximize')

    await clickControl(ctx.app, 'maximize-button')
    await until(async () => await label() === before, {
      what: 'the maximise button to come back to where it was'
    })
  })

  test('opens the secondary menu from the island', async () => {
    /* Observed in main, before the press: the menu is main's business, and the
       chrome page asking for it is the contract being tested. */
    const asked = inMain(ctx.app, ({ ipcMain }) => new Promise(resolve => {
      ipcMain.once('showSecondaryMenu', (e, data) => resolve(data))
      setTimeout(() => resolve(null), 10000)
    }))

    await openAddressBar(ctx.ui, ctx.app)
    await clickControl(ctx.app, 'menu-button')

    expect(await asked).not.toBeNull()

    /* A popped-up native menu eats the next CDP input, so it is dismissed the way a
       user dismisses it - a press on the page. */
    await cdp(ctx.app, 'pages/settings/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 400, y: 300, button: 'left', clickCount: 1 }},
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: 400, y: 300, button: 'left', clickCount: 1 }}
    ])
  })
})

/* The two buttons that end the window get an app each: a minimised window cannot
   take the focus CDP input needs, and a closed one has no chrome layer left. */
test.describe('the island’s window buttons', () => {
  let ctx

  const clickControl = async (app, id) => {
    const at = await chromeDom(app, `(() => {
      const rect = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect()
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
    })()`)

    await driveWindow(app, { op: 'focus' })
    await focusContents(app, 'pages/chrome/')
    await cdp(app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 }},
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }}
    ])
  }

  const windowState = (app, state) => inMain(app, ({ BaseWindow }, state) => {
    const win = BaseWindow.getAllWindows().find(w =>
      (w.contentView ? w.contentView.children : []).some(view =>
        view.webContents && view.webContents.getURL() === 'mercury://app/index.html'))
    if (!win) return null
    if (state === 'maximized') return win.isMaximized()
    if (state === 'minimized') return win.isMinimized()
    return null
  }, state)

  test.beforeAll(async () => {
    ctx = await launchApp()
    await openSettingsTab(ctx.ui, ctx.app)
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('minimises the window', async () => {
    await openAddressBar(ctx.ui, ctx.app)

    /* What the button is for is the request: whether the window manager takes it
       is the window's business, and a display with no window manager does not
       take it - there, the window's own state does not change and cannot be
       observed. The request is observed on the page main answers it on. */
    await chromeDom(ctx.app, 'window.__min = false; window.ipc.on("minimize", () => { window.__min = true }); undefined')

    await clickControl(ctx.app, 'minimize-button')

    await until(async () => await chromeDom(ctx.app, 'window.__min === true'), {
      what: 'the window to be asked to minimise'
    })
  })
})

/* Closing is its own app for the same reason: after it there is nothing left to
   drive. */
test.describe('closing from the island', () => {
  let ctx

  const clickControl = async (app, id) => {
    const at = await chromeDom(app, `(() => {
      const rect = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect()
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
    })()`)

    await driveWindow(app, { op: 'focus' })
    await focusContents(app, 'pages/chrome/')
    await cdp(app, 'pages/chrome/', [
      { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 }},
      { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }}
    ])
  }

  test.beforeAll(async () => {
    ctx = await launchApp()
    await openSettingsTab(ctx.ui, ctx.app)
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('closes the browser window', async () => {
    await openAddressBar(ctx.ui, ctx.app)

    /* The browser window is gone. How that shows depends on what else is open: the
       app may go with it, or the hidden history-service window may keep the process
       alive with the browser window destroyed inside it. Both are the window being
       closed; neither is "no windows at all", which the app's own windows make
       untrue on every run. */
    const closed = Promise.race([
      ctx.app.waitForEvent('close').then(() => 'app closed'),
      until(async () => {
        const facts = await viewFacts(ctx.app).catch(() => ({ found: false }))
        return facts.found ? null : 'window gone'
      }, { what: 'the browser window to close' }).then(() => 'window gone')
    ])

    await clickControl(ctx.app, 'close-button')
    expect(await closed).toBeTruthy()
  })
})

/* Task 9: the page paints its own top corners (§4.7), and the radius is a live
   setting.

   The proof is the spike's: the corner pixel is the frame's colour, and a pixel
   past the corner's own box is the page's. Both colours are read rather than
   hard-coded - the frame's from the token the layer was given, the page's from
   the page itself - because the settings page follows the machine's theme, and a
   test that named a colour would pass on one desktop and fail on another. */
test.describe('the page’s corners', () => {
  let ctx

  /* The page's own background, read from the page: the half of the corner that
     the page paints is the frame's colour, and the half it does not is the
     page's own. */
  const pageBackground = app => inMain(app, async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find(w => w.getURL().includes('/pages/settings/'))
    if (!wc) throw new Error('the settings page is not open')
    return wc.executeJavaScript('getComputedStyle(document.body).backgroundColor')
  })

  /* Is the page's pixel at that point this colour? */
  const pixelIs = async (app, point, expected) => {
    const [px] = await pixels(app, 'pages/settings/', [point])
    return px.r === expected.r && px.g === expected.g && px.b === expected.b
  }

  /* The chrome layer's own account of the radius: the frame's hairline is inset
     by it, so it has to follow the setting or the hairline and the page's arc
     would not meet (§4.7). */
  const frameRadius = app => chromeDom(app, 'getComputedStyle(document.documentElement).getPropertyValue("--r-page").trim()')

  test.beforeAll(async () => {
    ctx = await launchApp()
    // the settings page: it is the surface the setting is changed on, and a tab
    // view is what carries the preload that paints the corners
    await openSettingsTab(ctx.ui, ctx.app)
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('paints the page’s top corners at the default radius', async () => {
    const frame = (await framePaint(ctx.app)).rgb
    const page = rgbOfCss(await pageBackground(ctx.app))

    // the corner is the frame's colour: the page's own arc is cut out of it
    expect(await pixelIs(ctx.app, { x: 0, y: 0 }, frame)).toBe(true)
    // and a pixel past the corner's own box is the page's
    expect(await pixelIs(ctx.app, { x: 22, y: 22 }, page)).toBe(true)

    // the frame's hairline is inset by the same radius, so the two meet
    expect(await frameRadius(ctx.app)).toBe('20px')
  })

  test('takes the setting live, without a reload', async () => {
    const frame = (await framePaint(ctx.app)).rgb
    const page = rgbOfCss(await pageBackground(ctx.app))

    /* A sentinel in the page's own context: a reload would take it away, and
       nothing here reloads anything - the setting travels as a message to the
       view that is already open. */
    await inMain(ctx.app, ({ webContents }) => {
      const wc = webContents.getAllWebContents().find(w => w.getURL().includes('/pages/settings/'))
      return wc.executeJavaScript('window.__cornerSentinel = "kept"')
    })

    // radius 0: no corner at all, and the page's own pixels are there
    await setPageCornerRadius(ctx.app, 0)

    await until(async () => await pixelIs(ctx.app, { x: 0, y: 0 }, page), {
      what: 'the corner to lose the frame’s colour'
    })
    expect(await frameRadius(ctx.app)).toBe('0px')

    // radius 100: the corner is the frame's colour again, and the page's own
    // starts 100 px in
    await setPageCornerRadius(ctx.app, 100)

    await until(async () => await pixelIs(ctx.app, { x: 0, y: 0 }, frame), {
      what: 'the corner to take the frame’s colour back'
    })
    expect(await pixelIs(ctx.app, { x: 102, y: 102 }, page)).toBe(true)
    expect(await frameRadius(ctx.app)).toBe('100px')

    // and the page was never reloaded to get there
    const sentinel = await inMain(ctx.app, ({ webContents }) => {
      const wc = webContents.getAllWebContents().find(w => w.getURL().includes('/pages/settings/'))
      return wc.executeJavaScript('window.__cornerSentinel')
    })
    expect(sentinel).toBe('kept')
  })
})
