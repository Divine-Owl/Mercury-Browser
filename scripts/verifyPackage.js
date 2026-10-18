#!/usr/bin/env node
/*
Verifies that a packaged .deb carries the identity it is supposed to.

This exists because the interesting failure in Task 9 is silent. If
`linux.syncDesktopName` is absent or `package.json` loses `desktopName`, the build
still succeeds and still produces a working browser - it just installs
/usr/share/applications/mercury-browser.desktop instead of
org.mercury.Browser.desktop, and desktop environments stop associating the running
window with its launcher entry. Nothing else in the pipeline notices. So the check
here is the exact basename, and every other assertion is arranged around it.

The .deb is read with `ar` and `tar` rather than `dpkg-deb`: a .deb is an `ar`
archive holding a control tarball and a data tarball, `ar` and `tar` are on every
runner, and `dpkg-deb` is not on the CachyOS/Arch host this was developed on. No
compression flags are passed to `tar`, which detects gzip, xz and zstd itself -
the container's compression is electron-builder's choice and not ours to assume.

  node scripts/verifyPackage.js                    # the first .deb under dist/app
  node scripts/verifyPackage.js --deb <path>       # a specific package
  node scripts/verifyPackage.js --deb <path> --keep # leave the extraction behind

Exits 0 when every check passes, 1 otherwise. On failure the extraction directory
is kept and printed, so the wrong file can be read directly.
*/

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist', 'app')

function parseArgs (argv) {
  const opts = { deb: null, keep: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--deb') opts.deb = argv[++i]
    else if (arg === '--keep') opts.keep = true
    else if (arg === '--help' || arg === '-h') opts.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return opts
}

function have (command) {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' })
    return true
  } catch (e) {
    return false
  }
}

function findDeb () {
  if (!fs.existsSync(DIST)) return null
  const matches = fs.readdirSync(DIST)
    .filter(name => /^mercury-browser-.*\.deb$/.test(name))
    .sort()
  return matches.length === 0 ? null : path.join(DIST, matches[0])
}

// A .deb is an ar archive: debian-binary, control.tar.*, data.tar.*  Extracting
// each tarball into a directory named after its prefix keeps the two trees apart -
// control/control would otherwise collide with data/ if both went to one place.
function extract (debPath, tmp) {
  execFileSync('ar', ['x', debPath], { cwd: tmp })
  const members = fs.readdirSync(tmp).filter(name => /\.tar(\.[a-z0-9]+)*$/.test(name))
  if (members.length === 0) throw new Error('no *.tar.* members inside the .deb')
  for (const member of members) {
    const dest = path.join(tmp, member.startsWith('control') ? 'control' : 'data')
    fs.mkdirSync(dest, { recursive: true })
    execFileSync('tar', ['-xf', path.join(tmp, member), '-C', dest])
  }
}

// Build state that must never leave the build machine: npm's download cache
// (.npmrc points it at ./.cache/npm) and any virtualenv. Both live inside the
// checkout by design, which is exactly why they are one `files` pattern away
// from being shipped. Returns the offending paths relative to the data tree.
function findLocalBuildState (root) {
  const found = []
  const walk = dir => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      if (entry.name === '.cache' || entry.name === '.venv') found.push(path.relative(root, full))
      else walk(full)
    }
  }
  walk(root)
  return found
}

function desktopEntry (text) {
  const entry = {}
  for (const line of text.split('\n')) {
    const match = /^([A-Za-z0-9-]+)=(.*)$/.exec(line.trim())
    if (match) entry[match[1]] = match[2]
  }
  return entry
}

function main () {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log('usage: node scripts/verifyPackage.js [--deb <path>] [--keep]')
    return 0
  }

  // A clear message, not a stack trace: this is the one thing that stops the
  // script running somewhere unexpected.
  for (const tool of ['ar', 'tar']) {
    if (!have(tool)) {
      console.error(`verifyPackage: ${tool} is required and was not found in PATH`)
      console.error('  a .deb is an ar archive holding tar archives; either tool can unpack it')
      return 1
    }
  }

  const debPath = opts.deb ? path.resolve(opts.deb) : findDeb()
  if (!debPath) {
    console.error(`verifyPackage: no mercury-browser-*.deb found in ${path.relative(ROOT, DIST)}`)
    console.error('  build one first: npm run buildDebian')
    return 1
  }
  if (!fs.existsSync(debPath)) {
    console.error(`verifyPackage: no such file: ${debPath}`)
    return 1
  }

  const pkg = require('../package.json')
  const basename = path.basename(debPath)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-verify-'))

  let failures = 0
  let passes = 0
  const check = (label, ok, observed) => {
    if (ok) {
      passes++
      console.log(`  ok    ${label}`)
    } else {
      failures++
      console.log(`  FAIL  ${label}`)
      console.log(`        observed: ${observed}`)
    }
  }

  console.log(`verifyPackage: ${debPath}`)

  try {
    // ---- the artifact name, before anything is unpacked
    const nameMatch = /^mercury-browser-(.+)-([^-]+)\.deb$/.exec(basename)
    check(
      `artifact is named mercury-browser-<version>-<arch>.deb (found ${basename})`,
      Boolean(nameMatch),
      'expected mercury-browser-0.1.0-amd64.deb and the like'
    )
    if (nameMatch) {
      check(
        `artifact version matches package.json (${pkg.version})`,
        nameMatch[1] === pkg.version,
        `filename says ${nameMatch[1]}, package.json says ${pkg.version}`
      )
    }

    extract(debPath, tmp)

    // ---- control metadata
    const controlPath = path.join(tmp, 'control', 'control')
    check('control archive unpacks to a control file', fs.existsSync(controlPath), `${controlPath} is missing`)
    if (fs.existsSync(controlPath)) {
      const control = fs.readFileSync(controlPath, 'utf8')
      const field = key => (new RegExp(`^${key}: (.*)$`, 'm').exec(control) || [])[1]
      check(
        'the Debian package is named mercury-browser',
        field('Package') === 'mercury-browser',
        `Package: ${field('Package')}`
      )
      check(
        'the package maintainer is Mercury Developers',
        (field('Maintainer') || '').startsWith('Mercury Developers'),
        `Maintainer: ${field('Maintainer')}`
      )
    }

    // ---- the desktop entry: this is the reason the script exists
    const applications = path.join(tmp, 'data', 'usr', 'share', 'applications')
    const installed = fs.existsSync(applications) ? fs.readdirSync(applications).sort() : []
    const expectedDesktop = `${pkg.desktopName}.desktop`
    check(
      `usr/share/applications contains exactly ${expectedDesktop}`,
      installed.length === 1 && installed[0] === expectedDesktop,
      `found ${installed.length === 0 ? 'nothing' : installed.join(', ')}`
    )

    const desktopPath = path.join(applications, expectedDesktop)
    if (fs.existsSync(desktopPath)) {
      const entry = desktopEntry(fs.readFileSync(desktopPath, 'utf8'))
      check(
        `the desktop file's StartupWMClass is ${pkg.desktopName}`,
        entry.StartupWMClass === pkg.desktopName,
        `StartupWMClass=${entry.StartupWMClass}`
      )
      check(
        'the desktop file presents itself as Mercury',
        entry.Name === 'Mercury',
        `Name=${entry.Name}`
      )
      check(
        'the desktop file launches the mercury-browser executable',
        /\bmercury-browser\b/.test(entry.Exec || ''),
        `Exec=${entry.Exec}`
      )
      check(
        'the desktop file declares the mercury:// scheme handler',
        (entry.MimeType || '').split(';').includes('x-scheme-handler/mercury'),
        `MimeType=${entry.MimeType}`
      )
      check(
        'the desktop file carries no Min branding',
        !/\bMin\b/.test(fs.readFileSync(desktopPath, 'utf8')),
        'the whole word Min appears in the desktop entry'
      )

      // Icon= is the icon theme name, which only resolves if a file by that name
      // was installed. Asserting the file exists catches Icon= drifting away
      // from what FpmTarget installs, which is named after the executable.
      const icons = path.join(tmp, 'data', 'usr', 'share', 'icons', 'hicolor')
      const iconFiles = fs.existsSync(icons)
        ? fs.readdirSync(icons).flatMap(size =>
          path.join(icons, size, 'apps')).filter(dir => fs.existsSync(dir)).flatMap(dir =>
          fs.readdirSync(dir))
        : []
      check(
        `the Icon= name resolves to an installed icon (Icon=${entry.Icon})`,
        iconFiles.some(name => name === `${entry.Icon}.png` || name === `${entry.Icon}.svg`),
        `installed icons: ${iconFiles.length ? iconFiles.join(', ') : 'none'}`
      )
    }

    // ---- the binary itself
    const binary = path.join(tmp, 'data', 'opt', pkg.productName, 'mercury-browser')
    const binaryExists = fs.existsSync(binary)
    check(
      `opt/${pkg.productName}/mercury-browser exists`,
      binaryExists,
      `${binary} is missing`
    )
    if (binaryExists) {
      check(
        'the executable is marked executable',
        (fs.statSync(binary).mode & 0o111) !== 0,
        `mode ${(fs.statSync(binary).mode & 0o777).toString(8)}`
      )
    }

    // ---- build state inside the shipped app
    // This failed once for real, on a CI runner: electron-builder copied
    // .cache/npm into resources/app, npm deleted one of its own debug logs
    // mid-copy, and the build died with ENOENT - before a package existed, which
    // is why the guard is here as well as in the files list. It is also the
    // check that would catch a files pattern that stops pruning a directory.
    const buildState = findLocalBuildState(path.join(tmp, 'data'))
    check(
      'the package carries no local build state (.cache/.venv)',
      buildState.length === 0,
      `${buildState.length} offender(s): ${buildState.slice(0, 5).join(', ')}`
    )

    // ---- attribution, which has to travel with the artifact
    // Min is Apache-2.0, and section 4(d) requires a distribution to carry the
    // notices that came with it. Left unchecked this is invisible: the app binary
    // is identical whether or not LICENSE.txt and NOTICE are inside
    // resources/app, and the files list in createPackage.js includes them only
    // because nothing excludes them - one `!LICENSE.txt` or a `!**/*.txt` away
    // from a package that ships somebody else's code with no attribution.
    const appDir = path.join(tmp, 'data', 'opt', pkg.productName, 'resources', 'app')
    const licensePath = path.join(appDir, 'LICENSE.txt')
    const noticePath = path.join(appDir, 'NOTICE')

    const license = fs.existsSync(licensePath) ? fs.readFileSync(licensePath, 'utf8') : ''
    check(
      "the app carries Min's Apache-2.0 licence",
      /Apache License/.test(license) && /Version 2\.0/.test(license),
      fs.existsSync(licensePath)
        ? 'LICENSE.txt is present but does not read as Apache-2.0'
        : `${licensePath} is missing`
    )

    const notice = fs.existsSync(noticePath) ? fs.readFileSync(noticePath, 'utf8') : ''
    check(
      "the app carries the fork's NOTICE, naming upstream and version",
      /minbrowser\/min/.test(notice) && /v1\.35\.7/.test(notice),
      fs.existsSync(noticePath)
        ? 'NOTICE is present but does not name the upstream project and version'
        : `${noticePath} is missing`
    )
  } catch (e) {
    console.log(`  FAIL  extraction threw: ${e.message}`)
    failures++
  }

  if (failures === 0 && !opts.keep) fs.rmSync(tmp, { recursive: true, force: true })
  if (failures > 0) console.log(`\nextraction kept at ${tmp}`)
  console.log(`\n${passes} checks passed, ${failures} failed`)
  return failures === 0 ? 0 : 1
}

process.exitCode = main()
