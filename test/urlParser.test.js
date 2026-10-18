const test = require('node:test')
const assert = require('node:assert')
const { loadRendererModule } = require('./helpers/renderer.js')

const urlParser = loadRendererModule('js/util/urlParser.js')

// Review Focus #1: a scheme rename that only rewrites strings passes every
// grep-based test and still breaks the browser, because the normaliser is what
// turns a typed `mercury:settings` into the internal page. Before the rename
// this returns a DuckDuckGo search URL - the scheme is not recognised, so the
// typed URL falls through to the search engine.
test('a typed shortened internal URL resolves to the internal page, not a search', () => {
  assert.equal(urlParser.parse('mercury:settings'), 'mercury://app/pages/settings/index.html')
  assert.equal(urlParser.parse('mercury://settings'), 'mercury://app/pages/settings/index.html')
  assert.equal(urlParser.parse('mercury:newtab'), 'mercury://app/pages/newtab/index.html')
})

test('internal URL detection', () => {
  assert.equal(urlParser.isInternalURL('mercury://app/index.html'), true)
  assert.equal(urlParser.isInternalURL('https://example.com'), false)
})

test('viewer URLs map back to the page they display', () => {
  assert.equal(
    urlParser.getSourceURL('mercury://app/pages/reader/index.html?url=https%3A%2F%2Fexample.com'),
    'https://example.com'
  )
})
