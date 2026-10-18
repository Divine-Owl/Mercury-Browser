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

// The whole-word test above is too narrow, and a review found what it walked past:
// \b exists where the next character is not a word character, so an inflected or
// non-Latin form of the name passes it. Croatian "u Minu", Uzbek "Minni" and
// Korean 민(Mercury) all survived a rename that the tests called complete, three of
// them in *live* UI (the password-manager setup flow, the second-instance error and
// the startup-options label), and CI's built-output check greps -w "Min" so it could
// not see those either. One more hid inside a nested {unsafeHTML: ...} value, which a
// scan of top-level strings misses.
//
// Only the forms that name the browser are listed. Matching the stem would flag
// legitimate words that merely start with the same letters - Minimize,
// Minimalizovat, Mindent, Mini lecteur, Minutos - so each language contributes the
// forms actually found in it. A language nobody has looked at can still slip
// through, but the exact `Min` case is covered above for all 35.
test('no locale value names the product in an inflected or non-Latin form', () => {
  const FORMS = {
    fi: /\bMini(stä|n|ä|lle)\b/,
    hr: /\bMin(a|u|om|e|i|in)\b/,
    ko: /민/,
    uz: /\bMinn(i|ing)\b/
  }
  for (const file of localeFiles()) {
    const { identifier, translations } = parseLocale(file)
    const pattern = FORMS[identifier]
    if (!pattern) continue
    assert.doesNotMatch(JSON.stringify(translations), pattern, identifier)
  }
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
