const test = require('node:test')
const assert = require('node:assert')
const { readFile } = require('./helpers/repo.js')
const identity = require('../scripts/linuxIdentity.js')
const pkg = require('../package.json')

// The Linux packaging scripts only. buildMac.js and buildWindows.js are the
// deferred platform path and still carry Min's names; they are recorded in the
// ledger rather than asserted here.
const LINUX_PACKAGING = [
  'scripts/createPackage.js',
  'scripts/buildDebian.js',
  'scripts/buildAppImage.js',
  'scripts/buildRedhat.js'
]

const MAINTAINER_SCRIPTS = ['resources/postinst_script', 'resources/prerm_script']

test('the shared Linux identity is complete and self-consistent', () => {
  assert.equal(identity.executableName, 'mercury-browser')
  assert.equal(identity.syncDesktopName, true)
  assert.equal(identity.icon, 'icons/icon256.png')
  assert.equal(identity.category, 'Network;WebBrowser')
  assert.equal(identity.maintainer, 'Mercury Developers')
  assert.deepEqual(identity.mimeTypes, [
    'x-scheme-handler/http',
    'x-scheme-handler/https',
    'x-scheme-handler/mercury',
    'text/html'
  ])

  // Debian reads `synopsis` as the one-line summary and `description` as the
  // extended text, so the longer one has to be the description. Two of the four
  // scripts had them the other way round before they were consolidated.
  assert.ok(identity.synopsis.length > 0 && !identity.synopsis.includes('\n'))
  assert.ok(
    identity.description.length > identity.synopsis.length,
    'description must be the extended text; synopsis is the one-liner'
  )
})

// This is the test the module exists for. A desync between the four copies
// produces a build that succeeds and a desktop entry that does not work, so the
// copies have to not exist rather than merely agree today.
test('every Linux packaging script spreads the shared identity', () => {
  for (const rel of LINUX_PACKAGING) {
    assert.match(readFile(rel), /\.\.\.linuxIdentity/, `${rel} does not spread the shared identity`)
  }
})

test('no Linux packaging script re-declares a shared field', () => {
  // icon: is excluded on purpose - createPackage.js sets it separately for the
  // win and mac targets, which are not Linux and have their own icon formats.
  const shared = ['executableName:', 'syncDesktopName:', 'maintainer:', 'synopsis:', 'description:', 'mimeTypes:', 'category:']
  for (const rel of LINUX_PACKAGING) {
    const src = readFile(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const field of shared) {
      assert.doesNotMatch(
        src,
        new RegExp(`^\\s*${field}`, 'm'),
        `${rel} declares ${field} locally instead of using the shared identity`
      )
    }
  }
})

test('the packaged identity agrees with package.json', () => {
  assert.equal(pkg.name, 'mercury-browser')
  assert.equal(pkg.productName, 'Mercury')
  assert.equal(pkg.desktopName, 'org.mercury.Browser')
  assert.equal(identity.executableName, pkg.name)
  // The .desktop filename is desktopName, and StartupWMClass is desktopName
  // minus the suffix; both are what Electron uses as app_id.
  assert.ok(!pkg.desktopName.endsWith('.desktop'), 'desktopName is a basename, without the suffix')
})

test('the maintainer scripts use the paths the identity implies', () => {
  // electron-builder installs to /opt/<sanitizedProductName>/<executableName>.
  const binary = `/opt/${pkg.productName}/${identity.executableName}`
  const desktop = `${pkg.desktopName}.desktop`
  const [postinst, prerm] = MAINTAINER_SCRIPTS.map(readFile)

  for (const [rel, src] of [[MAINTAINER_SCRIPTS[0], postinst], [MAINTAINER_SCRIPTS[1], prerm]]) {
    assert.ok(src.includes(binary), `${rel} must reference ${binary}`)
    assert.doesNotMatch(src, /\/opt\/Min\b/, `${rel} still points at Min's install directory`)
    assert.doesNotMatch(src, /min\.desktop/, `${rel} still names Min's desktop file`)
    assert.doesNotMatch(src, /\/usr\/bin\/min\b/, `${rel} still references /usr/bin/min`)
  }

  // The chrome-sandbox lives beside the binary and needs its setuid bit; a path
  // that does not match the install directory fails silently at install time.
  assert.ok(postinst.includes(`/opt/${pkg.productName}/chrome-sandbox`), 'postinst must chmod the real chrome-sandbox path')

  // update-alternatives only removes an entry that was installed with an
  // identical path, so these two have to name the same file.
  assert.match(postinst, /update-alternatives --install \/usr\/bin\/x-www-browser[\s\S]{0,80}x-www-browser /, 'postinst must register the x-www-browser alternative')
  assert.ok(postinst.includes(binary) && prerm.includes(binary), 'the alternative target must match between install and remove')

  // The hint the user is told to run has to name the desktop file that actually
  // gets installed, or the advice is wrong.
  assert.ok(postinst.includes(desktop), `postinst must tell the user about ${desktop}`)
})

test('no Min packaging name survives in the Linux packaging path', () => {
  const forbidden = [
    /Min Developers/,
    /min-\$\{version\}/,
    /\/opt\/Min\b/,
    /min\.desktop/,
    /\/usr\/bin\/min\b/,
    /'min'/
  ]
  for (const rel of [...LINUX_PACKAGING, ...MAINTAINER_SCRIPTS]) {
    const src = readFile(rel)
    for (const pattern of forbidden) {
      assert.doesNotMatch(src, pattern, `${rel} still contains ${pattern}`)
    }
  }

  // Artifact names: what the release page shows and what Task 10's verifier globs.
  assert.match(readFile('scripts/buildDebian.js'), /artifactName: 'mercury-browser-\$\{version\}-\$\{arch\}\.deb'/)
  assert.match(readFile('scripts/buildRedhat.js'), /artifactName: 'mercury-browser-\$\{version\}-\$\{arch\}\.rpm'/)
  assert.match(readFile('scripts/buildDebian.js'), /packageName: 'mercury-browser'/)
  assert.match(readFile('scripts/buildRedhat.js'), /packageName: 'mercury-browser'/)
})

test('electron-builder is new enough for linux.syncDesktopName', () => {
  // 24.13.3 has no desktopName support at all: grep -r syncDesktopName
  // node_modules/app-builder-lib/out returns nothing. 26.17.0 has
  // LinuxTargetHelper.getDesktopFileName reading it, which is what makes the
  // desktop filename authoritative rather than the executable name.
  const range = pkg.devDependencies['electron-builder']
  const major = Number(range.replace(/^[^\d]*/, '').split('.')[0])
  assert.ok(major >= 26, `electron-builder ${range} predates linux.syncDesktopName`)
})
