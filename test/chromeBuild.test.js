const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, readFile } = require('./helpers/repo.js')
const pkg = require('../package.json')

const SHARED_MODULES = ['js/chrome/tokens.js', 'js/chrome/reveal.js', 'js/chrome/chromeSettings.js']

// The chrome page is the fourth build input (Global Constraints: four inputs,
// one rule each). The unit suite runs before any build on CI, so this test pins
// what can be checked in source: the entry points exist, npm builds them, the
// watcher rebuilds them, and main's concatenation list carries the three shared
// modules. The proof that a build actually emits dist/chrome.js is the build
// gate, not this file.
test('the chrome page is a build input of its own', () => {
  for (const rel of [
    'scripts/buildChrome.js',
    'js/chrome/default.js',
    'pages/chrome/index.html',
    'css/chrome.css'
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} does not exist`)
  }

  // `npm run build` calls `npm run buildChrome`, which needs the script entry to
  // exist.
  assert.ok(pkg.scripts.buildChrome, 'package.json has no buildChrome script')
  assert.match(pkg.scripts.buildChrome, /scripts\/buildChrome\.js/)
  assert.match(pkg.scripts.build, /buildChrome/, 'npm run build must build the chrome page')

  // The bundle is the page's only script, so the entry and the output are the
  // two names a mistake would move.
  const build = readFile('scripts/buildChrome.js')
  assert.match(build, /chrome\/default\.js/, 'the browserify entry is js/chrome/default.js')
  assert.match(build, /dist\/chrome\.js/, 'the bundle is written to dist/chrome.js')
  assert.match(build, /dist\/localization\.build\.js/, 'l() has to exist in the page')

  assert.match(readFile('scripts/watch.js'), /buildChrome/, 'scripts/watch.js must rebuild the chrome page')
})

// A shared module is one file in two bundles: concatenated into main.build.js,
// required by the chrome bundle. The guard is what makes the second use export,
// and the list is what makes the first use exist at all - a module main never
// loads is a module main cannot use.
test('the main bundle carries the three shared chrome modules', () => {
  const main = readFile('scripts/buildMain.js')
  for (const rel of SHARED_MODULES) {
    assert.ok(main.includes(`'${rel}'`), `scripts/buildMain.js must list ${rel}`)
    assert.match(
      readFile(rel),
      /if \(typeof module !== 'undefined'\)/,
      `${rel} needs the shared-module guard (js/util/theme.js is the precedent)`
    )
  }
})

// The frame, the strip and the island are the page's contract with every later
// task; renaming one silently at this stage would surface as a 0x0 element in a
// task three commits away.
test('the chrome page carries the frame, the strip and the island', () => {
  const html = readFile('pages/chrome/index.html')
  assert.match(html, /id="frame"/)
  assert.match(html, /id="strip"/)
  assert.match(html, /id="island"/)
  assert.match(html, /<link rel="stylesheet" href="\/css\/chrome\.css"/)
  assert.match(html, /<script src="\/dist\/chrome\.js"><\/script>/)

  // The internal pages carry their own CSP; the img-src is for favicons, which
  // the address pill shows from a page-supplied URL (§4.4).
  assert.match(html, /http-equiv="Content-Security-Policy"/)
  assert.match(html, /script-src 'self'/)
  assert.match(html, /img-src 'self' data: https: http:/)
})

// Global Constraints: the chrome page must not hardcode colours - every value is
// a custom property whose value comes from js/chrome/tokens.js. This is the test
// that keeps a hex value from creeping back in as the stylesheet grows.
test('the chrome stylesheet names no colour of its own', () => {
  const css = readFile('css/chrome.css')
  assert.doesNotMatch(css, /\brgba?\(|\bhsla?\(/, 'css/chrome.css must not name a colour function')
  for (const word of css.split(/[\s:;,()]+/)) {
    assert.doesNotMatch(word, /^#[0-9a-fA-F]{3,8}$/, `css/chrome.css names the literal colour ${word}`)
  }
})
