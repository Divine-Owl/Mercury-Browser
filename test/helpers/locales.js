// Locale helpers.
//
// The files are JSONC: they carry /* */ and // comments explaining each string's
// context, so a bare JSON.parse rejects valid files. decomment is the same tool
// the upstream build uses, so this parses exactly what the build parses.

const fs = require('node:fs')
const path = require('node:path')
const decomment = require('decomment')
const { ROOT } = require('./repo.js')

const LANGUAGES = path.join(ROOT, 'localization', 'languages')

function localeFiles () {
  return fs.readdirSync(LANGUAGES)
    .filter(name => name.endsWith('.json'))
    .map(name => path.join(LANGUAGES, name))
    .sort()
}

function parseLocale (absPath) {
  const parsed = JSON.parse(decomment(fs.readFileSync(absPath, 'utf8')))
  return {
    name: parsed.name,
    identifier: parsed.identifier,
    translations: parsed.translations
  }
}

// Nested objects are flattened with dot-joined paths, so a key is addressed the
// way the settings markup addresses its data-string: settingsBlockedRequestCount
// .unsafeHTML.
function flatten (obj, prefix = '', out = {}) {
  for (const key of Object.keys(obj)) {
    const qualified = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, qualified, out)
    } else {
      out[qualified] = value
    }
  }
  return out
}

// identifier -> sorted flattened key paths. Renaming a key changes this, adding
// or removing one changes it; editing a value does not. That is what makes it a
// usable key-set guard for a value-only rebrand.
function localeKeySets () {
  const sets = {}
  for (const file of localeFiles()) {
    const { identifier, translations } = parseLocale(file)
    sets[identifier] = Object.keys(flatten(translations)).sort()
  }
  return sets
}

module.exports = { localeFiles, parseLocale, localeKeySets }
