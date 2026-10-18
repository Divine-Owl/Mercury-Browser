const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { ROOT, readFile, sourceFiles, stripComments } = require('./helpers/repo.js')
const { loadRendererModule } = require('./helpers/renderer.js')

// Comments are stripped first, which is deliberate: the tree keeps upstream
// issue citations such as github.com/minbrowser/min/issues/657 in comments, and
// those are history, not branding. Only live code is checked.
test('no source still contains the whole word Min', () => {
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file)
    const code = stripComments(readFile(rel), path.extname(rel))
    assert.doesNotMatch(code, /\bMin\b/, rel)
  }
})

// t=min is the attribution tag DuckDuckGo receives. It is not the product name
// and no locale or title change touches it, so it needs its own assertion.
test('the search-engine attribution tag is not min', () => {
  for (const rel of ['js/util/searchEngine.js', 'js/searchbar/bangsPlugin.js', 'js/searchbar/instantAnswerPlugin.js']) {
    assert.doesNotMatch(readFile(rel), /[?&]t=min\b/, rel)
  }
})

// Deleting the tag outright would satisfy the test above while silently
// dropping the attribution, so assert the replacement rather than its absence.
test('the attribution tag is mercury', () => {
  assert.match(readFile('js/util/searchEngine.js'), /[?&]t=mercury\b/)
  assert.match(readFile('js/searchbar/bangsPlugin.js'), /[?&]t=mercury\b/)
  assert.match(readFile('js/searchbar/instantAnswerPlugin.js'), /[?&]t=mercury\b/)
})

// main/UASwitcher.js strips the app's own product token out of the user agent so
// every site sees plain Chrome. The token it strips is the product name, so
// renaming Min to Mercury silently breaks the strip and leaks `Mercury/0.1.0` in
// the UA of every request - invisible to a string test, which would only see
// that `/Min\/\S+\s/` changed to something. Run the real module and look at the
// user agent it produces.
test('the user-agent product token is stripped, not leaked', () => {
  global.app = {
    userAgentFallback: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Mercury/0.1.0 Chrome/120.0.0.0 Electron/28.0.0 Safari/537.36',
    once: () => {},
    on: () => {}
  }
  global.settings = { get: () => undefined }
  // The module reads process.versions.chrome to zero out the build number. That
  // exists in Electron, which is the only place the module runs, but not in
  // Node, so the harness supplies it rather than the test asserting on a
  // shortened code path.
  process.versions.chrome = '120.0.0.0'

  loadRendererModule('main/UASwitcher.js')

  const ua = global.app.userAgentFallback
  assert.doesNotMatch(ua, /Mercury\//, `product token leaked to every site: ${ua}`)
  assert.doesNotMatch(ua, /Electron\//, `runtime token leaked to every site: ${ua}`)
  assert.match(ua, /Chrome\/120\.0\.0\.0/, ua)
})
