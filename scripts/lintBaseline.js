// Gates `standard` on "no NEW errors" rather than "no errors".
//
// Min v1.35.7 does not lint clean. On the imported tree `standard` 14.3.4 reports
// 643 errors across js/ and main/, and it cannot even parse main/main.js, which has
// a top-level `return` that only becomes legal once browserify has wrapped the file.
// Upstream CI never ran the linter, so the debt was never paid down, and fixing 643
// unrelated errors is not this project's work.
//
// Losing the linter entirely would lose the one thing it is genuinely useful for
// here: catching variables, parameters and imports left orphaned when code is
// deleted. That is exactly what this project does a lot of.
//
// So the baseline is the per-file error count, and the gate fails only when a
// file's count grows. Line numbers are deliberately not compared: every task that
// edits a file shifts the lines of the errors above its edit, which would report
// dozens of false "new errors" per task.

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const BASELINE = path.join(ROOT, 'test/fixtures/lint-baseline.json')

// The same two patterns upstream's `npm test` passes to standard.
const GLOBS = ['js/**/*.js', 'main/*.js']

function runStandard () {
  const bin = path.join(ROOT, 'node_modules/.bin/standard')
  const args = [bin, ...GLOBS]
  // Without the binary this gate passes vacuously: execFileSync throws ENOENT, the
  // catch below returns its empty output, nothing matches the error pattern, every
  // file counts zero and the script announces "no new errors (0 total)". A missing
  // linter must not read as a clean tree, on CI or anywhere else.
  if (!fs.existsSync(bin)) {
    console.error(`lintBaseline: ${path.relative(ROOT, bin)} is missing - run npm install first`)
    console.error('  without the linter this check can see nothing, so it must not pass')
    process.exit(1)
  }
  try {
    return execFileSync(args[0], args.slice(1), {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (err) {
    // standard exits non-zero whenever it finds anything, which is the normal case.
    return `${err.stdout || ''}${err.stderr || ''}`
  }
}

function collect () {
  const counts = Object.create(null)
  const details = Object.create(null)
  for (const line of runStandard().split('\n')) {
    const match = line.match(/^\s+(\S+?):(\d+):(\d+): (.*)$/)
    if (!match) continue
    const rel = path.relative(ROOT, match[1])
    if (rel.startsWith('..')) continue
    counts[rel] = (counts[rel] || 0) + 1
    ;(details[rel] = details[rel] || []).push(`${match[2]}:${match[3]} ${match[4]}`)
  }
  return { counts, details }
}

const { counts, details } = collect()
const total = Object.values(counts).reduce((a, b) => a + b, 0)

if (process.argv.includes('--write-baseline')) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true })
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
  fs.writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 1)}\n`)
  console.log(`lint baseline written: ${Object.keys(sorted).length} files, ${total} errors`)
  process.exit(0)
}

if (!fs.existsSync(BASELINE)) {
  console.error(`no lint baseline at ${path.relative(ROOT, BASELINE)}; generate it with --write-baseline`)
  process.exit(1)
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
const grew = []
for (const [file, now] of Object.entries(counts)) {
  const was = baseline[file] || 0
  if (now > was) grew.push({ file, was, now })
}

const sum = Object.values(baseline).reduce((a, b) => a + b, 0)
// The other half of the same failure: the linter runs but reports nothing, which
// no version of this tree has ever been true of.
if (total === 0 && sum > 0) {
  console.error('lint: standard found nothing at all, which cannot be right for this tree')
  console.error(`  the baseline records ${sum} errors; treat this as the linter failing to run`)
  process.exit(1)
}
if (grew.length > 0) {
  console.error('lint: new errors introduced')
  for (const { file, was, now } of grew) {
    console.error(`  ${file}: ${was} -> ${now}`)
    for (const detail of details[file] || []) console.error(`      ${detail}`)
  }
  console.error(`\n${grew.length} file(s) regressed. Fix the new errors, or if the delete was`)
  console.error('deliberate and the message is pre-existing, regenerate the baseline.')
  process.exit(1)
}

console.log(`lint: no new errors (${total} total, baseline ${sum}); ${Object.keys(baseline).length} files recorded`)
