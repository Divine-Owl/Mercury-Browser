const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./helpers/repo.js')
const { localeFiles, parseLocale, localeKeySets } = require('./helpers/locales.js')

test('every locale file parses', () => {
  for (const file of localeFiles()) assert.doesNotThrow(() => parseLocale(file), file)
})

test('no locale key was added, removed or renamed', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/localization-keys.json'), 'utf8'))
  assert.deepEqual(localeKeySets(), expected)
})

// \b is ASCII-only, which is what makes it correct here: `Minは` and `Minの` have
// a boundary after Min, while `timeRangeMinutes` and `appMenuMinimize` do not -
// those are keys, and the key-set test above would catch their corruption anyway.
test('no locale value contains the whole word Min', () => {
  for (const file of localeFiles()) {
    const { identifier, translations } = parseLocale(file)
    assert.doesNotMatch(JSON.stringify(translations), /\bMin\b/, identifier)
  }
})

test('the product name is substituted in a non-Latin locale', () => {
  const ja = parseLocale(localeFiles().find(f => f.endsWith('/ja.json')))
  assert.match(ja.translations.serverNotFoundSubtitle, /Mercury/)
})

// Three keys embed a <a href> into Min's own GitHub: sessionRestoreErrorLinkInfo
// ("report this bug here"), settingsUserscriptsExplanation (Min's wiki) and
// settingsUsageStatisticsToggle (Min's statistics doc). They are values, so
// renaming the word Min does not touch them, and they are user-clickable - the
// first is reached from the session-restore error page. Nothing else covers
// them: test/no-min-infrastructure.test.js scans js/, main/, pages/, reader/ and
// the root index.html, not localization/.
test('no locale value links to a Min host', () => {
  for (const file of localeFiles()) {
    const { identifier, translations } = parseLocale(file)
    assert.doesNotMatch(JSON.stringify(translations), /minbrowser/, identifier)
  }
})
