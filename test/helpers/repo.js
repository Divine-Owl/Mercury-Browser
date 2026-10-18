// Shared helpers for the source-tree assertions.
//
// ROOT is absolute so a test can run from any cwd. readFile takes a
// repository-relative path, which is what every call site passes — usually
// derived with path.relative(ROOT, file). sourceFiles returns absolute paths.

const fs = require('node:fs')
const path = require('node:path')
const decomment = require('decomment')

const ROOT = path.resolve(__dirname, '..', '..')

// The scanned prefixes, deliberately narrow. Localisation data lives in
// localization/languages, which is not source we hand-edit — Task 7 reads it
// through its own helper; bundled third-party code lives in ext/.
const SOURCE_DIRS = ['js', 'main', 'pages', 'reader']
const SOURCE_EXT = new Set(['.js', '.html', '.css'])

function readFile (rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function sourceFiles () {
  const found = []
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (SOURCE_EXT.has(path.extname(entry.name))) {
        found.push(full)
      }
    }
  }
  for (const dir of SOURCE_DIRS) {
    const full = path.join(ROOT, dir)
    if (fs.existsSync(full)) walk(full)
  }
  const index = path.join(ROOT, 'index.html')
  if (fs.existsSync(index)) found.push(index)
  return found.sort()
}

// Comments are stripped before every assertion that greps for a URL or an
// identifier: the tree keeps upstream issue citations in comments on purpose,
// and those cite minbrowser URLs. Nearly every such assertion is therefore
// "not present in stripped code", never "not present in the raw file".
function stripComments (text, ext) {
  if (ext === '.js') return decomment(text)
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

module.exports = { ROOT, readFile, sourceFiles, stripComments }
