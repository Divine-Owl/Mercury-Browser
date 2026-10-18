const packageFile = require('./../package.json')
const version = packageFile.version
const builder = require('electron-builder')
const Platform = builder.Platform
const Arch = builder.Arch

const linuxIdentity = require('./linuxIdentity.js')

function toArch (platform) {
  switch (platform) {
    case 'amd64':
      return Arch.x64
    case 'armhf':
      return Arch.armv71
    case 'arm64':
      return Arch.arm64
    default:
      return Arch.universal
  }
}
require('./createPackage.js')('linux', { arch: Arch.x64 }).then(function (path) {
  var installerOptions = {
    artifactName: 'mercury-browser-${version}-${arch}.rpm',
    packageName: 'mercury-browser',
    packageCategory: 'Network'
  }

  console.log('Creating package (this may take a while)')

  const options = {
    linux: {
      ...linuxIdentity,
      target: ['rpm']
    },
    directories: {
      output: 'dist/app/'
    },
    rpm: installerOptions,
    publish: null
  }

  builder.build({
    prepackaged: path,
    targets: Platform.LINUX.createTarget(['rpm'], Arch.x64),
    config: options
  })
    .then(() => console.log('Successfully created package.'))
    .catch(err => {
      console.error(err, err.stack)
      process.exit(1)
    })
})
