const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./helpers/repo.js')

test('package.json carries the Mercury identity', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'mercury-browser')
  assert.equal(pkg.productName, 'Mercury')
  assert.equal(pkg.desktopName, 'org.mercury.Browser')
  assert.equal(pkg.version, '0.1.0')
})
