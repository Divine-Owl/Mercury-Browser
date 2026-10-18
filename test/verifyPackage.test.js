const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const VERIFIER = path.join(ROOT, 'scripts', 'verifyPackage.js')
const pkg = require('../package.json')

// scripts/verifyPackage.js is the only check that can catch a wrong desktopName
// wiring, and it is otherwise only ever run on a CI runner, where a bug in the
// verifier itself shows up as an unexplained red build. So it is tested here
// against a .deb this file builds out of ar and tar - the same tools the verifier
// uses, so the test needs nothing that the host does not already have.

const GOOD_DESKTOP = [
  '[Desktop Entry]',
  'Type=Application',
  'Name=Mercury',
  'Comment=Fast, minimal, privacy-focused web browser',
  'Exec=/opt/Mercury/mercury-browser %U',
  'Icon=mercury-browser',
  'Terminal=false',
  `StartupWMClass=${pkg.desktopName}`,
  'MimeType=x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/mercury;text/html;',
  'Categories=Network;WebBrowser;',
  ''
].join('\n')

const GOOD_CONTROL = [
  'Package: mercury-browser',
  `Version: ${pkg.version}`,
  'Architecture: amd64',
  'Maintainer: Mercury Developers',
  'Description: Fast, minimal, privacy-focused web browser',
  ''
].join('\n')

// Builds a synthetic .deb with the same shape as the one electron-builder emits:
// ar(debian-binary, control.tar.gz, data.tar.gz).
function buildDeb (opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-deb-'))
  const stage = path.join(dir, 'stage')
  const control = path.join(stage, 'control')
  const data = path.join(stage, 'data')
  const applications = path.join(data, 'usr/share/applications')
  const icons = path.join(data, 'usr/share/icons/hicolor/256x256/apps')
  const installDir = path.join(data, 'opt', pkg.productName)
  for (const d of [control, applications, icons, installDir]) fs.mkdirSync(d, { recursive: true })

  fs.writeFileSync(path.join(control, 'control'), opts.control || GOOD_CONTROL)
  fs.writeFileSync(path.join(control, 'md5sums'), '')

  const desktopName = opts.desktopName || `${pkg.desktopName}.desktop`
  fs.writeFileSync(path.join(applications, desktopName), opts.desktop || GOOD_DESKTOP)
  const iconName = opts.iconName || 'mercury-browser'
  fs.writeFileSync(path.join(icons, `${iconName}.png`), 'placeholder')

  if (!opts.skipBinary) {
    const binary = path.join(installDir, 'mercury-browser')
    fs.writeFileSync(binary, '#!/bin/sh\nexit 0\n')
    fs.chmodSync(binary, opts.binaryMode === undefined ? 0o755 : opts.binaryMode)
  }

  if (opts.buildState) {
    // Exactly the shape that broke the first CI run: npm's own debug log, inside
    // the cache that .npmrc redirected into the checkout.
    const logs = path.join(data, '.cache/npm/_logs')
    fs.mkdirSync(logs, { recursive: true })
    fs.writeFileSync(path.join(logs, '2026-10-18T14_47_02_849Z-debug-0.log'), 'npm http fetch GET 200\n')
  }

  // -C into the tree and then name the tarball, exactly as fpm does. No
  // compression flags on the way out either; tar picks gzip here, but the
  // verifier has to cope with whatever electron-builder emits.
  execFileSync('tar', ['-czf', path.join(stage, 'control.tar.gz'), '-C', control, '.'])
  execFileSync('tar', ['-czf', path.join(stage, 'data.tar.gz'), '-C', data, '.'])
  fs.writeFileSync(path.join(stage, 'debian-binary'), '2.0\n')

  const filename = opts.filename || `mercury-browser-${pkg.version}-amd64.deb`
  const debPath = path.join(dir, filename)
  execFileSync('ar', ['rcs', debPath, 'debian-binary', 'control.tar.gz', 'data.tar.gz'], { cwd: stage })
  return debPath
}

function verify (debPath) {
  const result = spawnSync(process.execPath, [VERIFIER, '--deb', debPath], { encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

test('a correctly packaged .deb passes every check', () => {
  const { status, output } = verify(buildDeb())
  assert.strictEqual(status, 0, output)
  assert.match(output, /ok\s+usr\/share\/applications contains exactly org\.mercury\.Browser\.desktop/)
  assert.match(output, /ok\s+the desktop file's StartupWMClass is org\.mercury\.Browser/)
  assert.match(output, /ok\s+the desktop file declares the mercury:\/\/ scheme handler/)
  assert.match(output, /ok\s+opt\/Mercury\/mercury-browser exists/)
  assert.match(output, /0 failed/)
})

// The failure this whole task is about. Without linux.syncDesktopName the build
// is correct in every other respect and the desktop file is named after the
// executable, so the window is never associated with its launcher entry.
test('it catches a desktop file named after the executable instead of the app id', () => {
  const { status, output } = verify(buildDeb({ desktopName: 'mercury-browser.desktop' }))
  assert.strictEqual(status, 1, output)
  assert.match(output, /FAIL\s+usr\/share\/applications contains exactly org\.mercury\.Browser\.desktop/)
  assert.match(output, /observed: found mercury-browser\.desktop/)
})

test('it catches a StartupWMClass that does not match the app id', () => {
  const desktop = GOOD_DESKTOP.replace(`StartupWMClass=${pkg.desktopName}`, 'StartupWMClass=mercury')
  const { status, output } = verify(buildDeb({ desktop }))
  assert.strictEqual(status, 1, output)
  assert.match(output, /FAIL\s+the desktop file's StartupWMClass is org\.mercury\.Browser/)
  assert.match(output, /observed: StartupWMClass=mercury/)
})

test('it catches a desktop file that does not register the mercury:// scheme', () => {
  const desktop = GOOD_DESKTOP.replace('x-scheme-handler/mercury;', '')
  const { status, output } = verify(buildDeb({ desktop }))
  assert.strictEqual(status, 1, output)
  assert.match(output, /FAIL\s+the desktop file declares the mercury:\/\/ scheme handler/)
})

test('it catches Min branding in the desktop file', () => {
  const desktop = GOOD_DESKTOP.replace('Name=Mercury', 'Name=Min')
  const { status, output } = verify(buildDeb({ desktop }))
  assert.strictEqual(status, 1, output)
  assert.match(output, /FAIL\s+the desktop file presents itself as Mercury/)
  assert.match(output, /FAIL\s+the desktop file carries no Min branding/)
})

test('it catches an Icon= name that was never installed', () => {
  const { status, output } = verify(buildDeb({ iconName: 'mercury' }))
  assert.strictEqual(status, 1, output)
  assert.match(output, /FAIL\s+the Icon= name resolves to an installed icon/)
})

test('it catches an Exec that names the wrong binary', () => {
  const desktop = GOOD_DESKTOP.replace('Exec=/opt/Mercury/mercury-browser %U', 'Exec=/opt/Mercury/mercury %U')
  const { status, output } = verify(buildDeb({ desktop }))
  assert.strictEqual(status, 1, output)
  assert.match(output, /FAIL\s+the desktop file launches the mercury-browser executable/)
})

test('it catches a missing or non-executable binary', () => {
  const missing = verify(buildDeb({ skipBinary: true }))
  assert.strictEqual(missing.status, 1, missing.output)
  assert.match(missing.output, /FAIL\s+opt\/Mercury\/mercury-browser exists/)

  const notExecutable = verify(buildDeb({ binaryMode: 0o644 }))
  assert.strictEqual(notExecutable.status, 1, notExecutable.output)
  assert.match(notExecutable.output, /FAIL\s+the executable is marked executable/)
  assert.match(notExecutable.output, /observed: mode 644/)
})

test('it catches a package that is still called min', () => {
  const control = GOOD_CONTROL.replace('Package: mercury-browser', 'Package: min')
  const { status, output } = verify(buildDeb({ control }))
  assert.strictEqual(status, 1, output)
  assert.match(output, /FAIL\s+the Debian package is named mercury-browser/)
  assert.match(output, /observed: Package: min/)
})

test('it catches a mis-named artifact and a version that does not match package.json', () => {
  const misnamed = verify(buildDeb({ filename: 'mercury-browser-amd64.deb' }))
  assert.strictEqual(misnamed.status, 1, misnamed.output)
  assert.match(misnamed.output, /FAIL\s+artifact is named mercury-browser-<version>-<arch>\.deb/)

  const wrongVersion = verify(buildDeb({ filename: 'mercury-browser-9.9.9-amd64.deb' }))
  assert.strictEqual(wrongVersion.status, 1, wrongVersion.output)
  assert.match(wrongVersion.output, /FAIL\s+artifact version matches package\.json/)
})

test('it catches local build state shipped inside the app', () => {
  const { status, output } = verify(buildDeb({ buildState: true }))
  assert.strictEqual(status, 1, output)
  assert.match(output, /FAIL\s+the package carries no local build state/)
  assert.match(output, /observed: 1 offender\(s\): \.cache/)
})

test('it reports a clear error rather than a stack trace when there is nothing to verify', () => {
  const { status, output } = verify(path.join(os.tmpdir(), 'definitely-not-a-package.deb'))
  assert.strictEqual(status, 1, output)
  assert.match(output, /no such file/)
  assert.doesNotMatch(output, /at Object\.<anonymous>/, 'should not be a stack trace')
})
