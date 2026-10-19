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

const { launchApp, inMain, ensureSettingsPage } = require('./harness.js')

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
