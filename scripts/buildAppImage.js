const builder = require('electron-builder')
const packageFile = require('./../package.json')
const version = packageFile.version
const Platform = builder.Platform
const Arch = builder.Arch

const linuxIdentity = require('./linuxIdentity.js')

require('./createPackage.js')('linux', {arch: Arch.x64}).then(function (path) {
  const options = {
    linux: {
      ...linuxIdentity,
      target: ['AppImage']
    },
    directories: {
      output: 'dist/app/'
    },
    publish: null
  }

  builder.build({
    prepackaged: path,
    targets: Platform.LINUX.createTarget(['AppImage'], Arch.x64),
    config: options
  })
})
