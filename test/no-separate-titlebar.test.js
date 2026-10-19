const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, readFile } = require('./helpers/repo.js')

// The four trees that could carry the setting: the UI (js), the main process
// (main), the settings page (pages) and the window-control stylesheet (css).
// test/helpers/repo.js scans js/, main/, pages/ and reader/, deliberately not
// css/, so this test walks its own list rather than reusing sourceFiles().
const SCANNED_DIRS = ['js', 'main', 'pages', 'css']
const SOURCE_EXT = new Set(['.js', '.html', '.css'])

function scannedFiles () {
  const found = []
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (SOURCE_EXT.has(path.extname(entry.name))) {
        found.push(full)
      }
    }
  }
  for (const dir of SCANNED_DIRS) {
    const full = path.join(ROOT, dir)
    if (fs.existsSync(full)) walk(full)
  }
  return found.sort()
}

// `useSeparateTitlebar` was the setting; `separate-titlebar` was the body class
// it drove. Neither may survive as an identifier or a selector: the window is
// frameless and transparent unconditionally now, so a leftover would be dead
// code pretending to be a choice. The locale key `settingsSeparateTitlebarToggle`
// is not one of these strings and is deliberately kept (locale keys are frozen).
test('the separate-titlebar setting is gone from the source', () => {
  for (const file of scannedFiles()) {
    const rel = path.relative(ROOT, file)
    assert.doesNotMatch(readFile(rel), /useSeparateTitlebar|separate-titlebar/, rel)
  }
})

// There is no runtime getter for `frame`, and this Electron version's
// getBackgroundColor() drops the alpha channel, so the option values are the
// thing the setting can no longer vary and the thing this test pins down.
test('the window is always frameless and transparent', () => {
  const main = readFile('main/main.js')
  assert.match(main, /frame: false/)
  assert.match(main, /transparent: true/)
})
