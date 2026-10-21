/* temporary: what the new tab page shows - deleted after */
const { test } = require('@playwright/test')
const fs = require('fs')
const { launchApp, inMain, openNewTabPage, until } = require('./harness.js')

test('the new tab page in the window', async () => {
  const ctx = await launchApp()
  await openNewTabPage(ctx.ui, ctx.app)
  await new Promise(r => setTimeout(r, 800))

  const info = await inMain(ctx.app, ({ BaseWindow }) => {
    const win = BaseWindow.getAllWindows().find(w =>
      (w.contentView ? w.contentView.children : []).some(v => v.webContents && v.webContents.getURL() === 'mercury://app/index.html'))
    const children = win.getContentView().children.map(v => ({
      url: v.webContents ? v.webContents.getURL() : '(none)',
      bounds: v.getBounds(),
      // the view's own background: a transparent one lets the layer below through
      background: v.getBackgroundColor ? v.getBackgroundColor() : null
    }))
    return children
  })
  console.log('tree:', JSON.stringify(info, null, 1))

  const composite = await inMain(ctx.app, async ({ webContents, nativeImage }) => {
    const shot = async fragment => {
      const wc = webContents.getAllWebContents().find(w => w.getURL().includes(fragment))
      const image = await wc.capturePage()
      return { size: image.getSize(), bmp: image.getBitmap() }
    }
    const ui = await shot('mercury://app/index.html')
    const tab = await shot('pages/newtab/')
    const canvas = Buffer.from(ui.bmp)
    for (let y = 0; y < tab.size.height; y++) {
      for (let x = 0; x < tab.size.width; x++) {
        const s = (y * tab.size.width + x) * 4
        const d = ((12 + y) * ui.size.width + x) * 4
        if (d + 3 >= canvas.length) continue
        canvas[d] = tab.bmp[s]
        canvas[d + 1] = tab.bmp[s + 1]
        canvas[d + 2] = tab.bmp[s + 2]
        canvas[d + 3] = 255
      }
    }
    return nativeImage.createFromBitmap(canvas, { width: ui.size.width, height: ui.size.height })
      .crop({ x: 0, y: 0, width: Math.min(1396, ui.size.width), height: 90 })
      .toPNG().toString('base64')
  })
  fs.writeFileSync('/tmp/opencode/window-newtab.png', Buffer.from(composite, 'base64'))
  await ctx.close()
})
