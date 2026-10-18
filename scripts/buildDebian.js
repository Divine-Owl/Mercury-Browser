const builder = require('electron-builder')
const Platform = builder.Platform
const Arch = builder.Arch

const createPackage = require('./createPackage.js')
const linuxIdentity = require('./linuxIdentity.js')

async function afterPackageBuilt (path, arch) {
  // Only what is specific to a .deb. The shared identity - icon, category,
  // mimeTypes, maintainer, synopsis, description, executableName and
  // syncDesktopName - comes from linuxIdentity.js: electron-builder's
  // FpmTarget merges the `linux` options underneath these, so deb and rpm are
  // described by one definition instead of two that had already drifted.
  var installerOptions = {
    artifactName: 'mercury-browser-${version}-${arch}.deb',
    packageName: 'mercury-browser',
    packageCategory: 'Network',
    depends: [
      'libsecret-1-0',
      'libasound2',
      'libc6',
      'libcap2',
      'libgtk2.0-0',
      'libudev0 | libudev1',
      'libgcrypt11 | libgcrypt20',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'python | python3',
      'xdg-utils'
    ],
    afterInstall: 'resources/postinst_script',
    afterRemove: 'resources/prerm_script'
  }

  console.log('Creating package (this may take a while)')

  const options = {
    linux: {
      ...linuxIdentity,
      target: ['deb']
    },
    directories: {
      buildResources: 'resources',
      output: 'dist/app/'
    },
    deb: installerOptions,
    publish: null
  }

  await builder.build({
    prepackaged: path,
    targets: Platform.LINUX.createTarget(['deb'], arch),
    config: options
  })
    .then(() => console.log('Successfully created package.'))
    .catch(err => {
      console.error(err, err.stack)
      process.exit(1)
    })
}

const arches = [Arch.x64, Arch.armv7l, Arch.arm64];

(async () => {
  for (const arch of arches) {
    await createPackage('linux', { arch: arch }).then(path => afterPackageBuilt(path, arch))
  }
})()
