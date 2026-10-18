const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, readFile, sourceFiles, stripComments } = require('./helpers/repo.js')

// A scheme followed by a URL: 'min://newtab', "min://app/index.html".
const SCHEME_SITE = /(['"`])min:(\/\/)?[a-zA-Z0-9]/

// The bare form: `startsWith('min://')`, `=== 'min:'`. The plan's pattern above
// deliberately requires an alphanumeric after the colon, so it does not see
// these - and they are the ones that break quietly. Both preload guards test
// e.origin against the bare scheme, so missing one there means the preload
// rejects Mercury's own internal pages; tagIndex and viewManager test it the
// same way.
const SCHEME_BARE = /(['"`])min:(\/\/)?['"`)]/

// A bare quoted scheme token, with no colon at all. main/viewManager.js holds
// one: `knownProtocols = [..., 'min', ...]`, which is what decides whether a URL
// is handed to the OS as an external protocol. Leave 'min' in that list and
// every mercury:// URL looks external, because 'mercury' would not be in it.
const SCHEME_TOKEN = /(['"`])min(['"`])/

test('no source still uses the min: scheme', () => {
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file)
    const code = stripComments(readFile(rel), path.extname(rel))
    assert.doesNotMatch(code, SCHEME_SITE, rel)
    assert.doesNotMatch(code, SCHEME_BARE, rel)
    assert.doesNotMatch(code, SCHEME_TOKEN, rel)
  }
})

test('the internal protocol module, and every reference to it, is renamed', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'main/minInternalProtocol.js')), false)
  const src = readFile('main/mercuryInternalProtocol.js')
  assert.match(src, /registerSchemesAsPrivileged/)
  assert.match(src, /scheme:\s*'mercury'/)
  assert.match(src, /protocol\.handle\('mercury'/)
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file)
    assert.doesNotMatch(stripComments(readFile(rel), path.extname(rel)), /minInternalProtocol/, rel)
  }
})
