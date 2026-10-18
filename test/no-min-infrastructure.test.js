const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, readFile, sourceFiles, stripComments } = require('./helpers/repo.js')

const EXCLUDED = ['pages/translateService/']

test('no functional reference to a Min host remains', () => {
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file)
    if (EXCLUDED.some(prefix => rel.startsWith(prefix))) continue
    const code = stripComments(readFile(rel), path.extname(rel))
    assert.doesNotMatch(code, /minbrowser\.(org|github\.io)/, rel)
  }
})

test('the update feed is gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'js/searchbar/updateNotifications.js')), false)
})

test('no source schedules an update check', () => {
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file)
    const code = stripComments(readFile(rel), path.extname(rel))
    assert.doesNotMatch(code, /updateNotifications/, rel)
  }
})
