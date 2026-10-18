// The Linux packaging identity, in one place.
//
// scripts/createPackage.js, buildDebian.js, buildAppImage.js and buildRedhat.js
// each spread this into their `linux` options. That is the correct home for all
// of it, including the fields deb and rpm read: electron-builder's FpmTarget
// builds its options as `deepAssign({}, platformSpecificBuildOptions, config[name])`,
// so everything here reaches `deb` and `rpm` as well, and each script keeps only
// what is specific to its own format.
//
// Four copies is how the scripts drifted apart in the first place: `deb` and
// `rpm` described Min with different strings, and two of the four had Debian's
// synopsis and description the wrong way round.

module.exports = {
  // Names the installed binary: /opt/Mercury/mercury-browser, and Icon= in the
  // .desktop entry. Not cosmetic - scripts/createPackage.js flips Electron's
  // fuses on the binary before packaging, and it has to name the same file
  // electron-builder produced.
  executableName: 'mercury-browser',

  // Takes the installed .desktop filename from package.json's `desktopName`
  // (org.mercury.Browser) rather than from the executable name, so that it
  // matches StartupWMClass and Electron's app_id. Without it the desktop entry
  // is still written and still correct, but desktop environments may not
  // associate the running window with it - a fault that shows up in someone's
  // desktop session and nowhere in CI.
  syncDesktopName: true,

  icon: 'icons/icon256.png',
  category: 'Network;WebBrowser',
  mimeTypes: [
    'x-scheme-handler/http',
    'x-scheme-handler/https',
    // mercury:// — the internal protocol. Without this the .desktop entry does
    // not advertise the scheme and the desktop cannot route it back here, even
    // though main/mercuryInternalProtocol.js handles it.
    'x-scheme-handler/mercury',
    'text/html'
  ],

  maintainer: 'Mercury Developers',

  // Debian's two descriptions, in Debian's order: `synopsis` is the single line
  // in a package listing, `description` the paragraph behind `apt show`. Both
  // are written fresh rather than renamed - Min's copy advertises DuckDuckGo
  // instant answers and Min's feature set.
  synopsis: 'Fast, minimal, privacy-focused web browser',
  description: 'Mercury is a fast, minimal web browser that protects your privacy. It includes tab groups and tasks, full-text history search, a reader view, focus mode and built-in content blocking, and it is built on a small, auditable codebase.'
}
