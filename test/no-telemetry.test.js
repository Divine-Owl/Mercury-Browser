const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, readFile, sourceFiles, stripComments } = require('./helpers/repo.js')

test('the statistics module is gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'js/statistics.js')), false)
})

test('no source references telemetry', () => {
  for (const file of sourceFiles()) {
    const ext = path.extname(file)
    const code = stripComments(readFile(path.relative(ROOT, file)), ext)
    // Scoped to the telemetry endpoint, not the whole minbrowser.org host:
    // pages/translateService/translateService.js legitimately references
    // services.minbrowser.org/bergamot-models-v1 three times and is not
    // removed until Task 5. The broader whole-host check is Task 4's job,
    // which excludes that directory until Task 5 tightens it.
    assert.doesNotMatch(code, /services\.minbrowser\.org\/stats/, file)
    assert.doesNotMatch(code, /collectUsageStats/, file)
  }
})

test('the usage-statistics toggle is removed from settings', () => {
  const html = readFile('pages/settings/index.html')
  assert.doesNotMatch(html, /checkbox-usage-statistics/)
  assert.doesNotMatch(readFile('pages/settings/settings.js'), /usageStatisticsCheckbox/)
})
