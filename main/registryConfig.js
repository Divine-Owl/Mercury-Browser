var regedit = require('regedit')

var installPath = process.execPath

var keysToCreate = [
  'HKCU\\Software\\Classes\\Mercury',
  'HKCU\\Software\\Classes\\Mercury\\Application',
  'HKCU\\Software\\Classes\\Mercury\\DefaulIcon',
  'HKCU\\Software\\Classes\\Mercury\\shell\\open\\command',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\Capabilities\\FileAssociations',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\Capabilities\\StartMenu',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\Capabilities\\URLAssociations',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\DefaultIcon',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\InstallInfo',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\shell\\open\\command'
]

var registryConfig = {
  'HKCU\\Software\\RegisteredApplications': {
    Mercury: {
      value: 'Software\\Clients\\StartMenuInternet\\Mercury\\Capabilities',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Mercury': {
    default: {
      value: 'Mercury Browser Document',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Classes\\Mercury\\Application': {
    ApplicationIcon: {
      value: installPath + ',0',
      type: 'REG_SZ'
    },
    ApplicationName: {
      value: 'Mercury',
      type: 'REG_SZ'
    },
    AppUserModelId: {
      value: 'Mercury',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Mercury\\DefaulIcon': {
    ApplicationIcon: {
      value: installPath + ',0',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Mercury\\shell\\open\\command': {
    default: {
      value: '"' + installPath + '" "%1"',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Classes\\.htm\\OpenWithProgIds': {
    Mercury: {
      value: 'Empty',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\.html\\OpenWithProgIds': {
    Mercury: {
      value: 'Empty',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\Capabilities\\FileAssociations': {
    '.htm': {
      value: 'Mercury',
      type: 'REG_SZ'
    },
    '.html': {
      value: 'Mercury',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\Capabilities\\StartMenu': {
    StartMenuInternet: {
      value: 'Mercury',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\Capabilities\\URLAssociations': {
    http: {
      value: 'Mercury',
      type: 'REG_SZ'
    },
    https: {
      value: 'Mercury',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\DefaultIcon': {
    default: {
      value: installPath + ',0',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\InstallInfo': {
    IconsVisible: {
      value: 1,
      type: 'REG_DWORD'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Mercury\\shell\\open\\command': {
    default: {
      value: installPath,
      type: 'REG_DEFAULT'
    }
  }
}

var registryInstaller = {
  install: function () {
    return new Promise(function (resolve, reject) {
      regedit.createKey(keysToCreate, function (err) {
        regedit.putValue(registryConfig, function (err) {
          if (err) {
            reject()
          } else {
            resolve()
          }
        })
      })
    })
  },
  uninstall: function () {
    return new Promise(function (resolve, reject) {
      regedit.deleteKey(keysToCreate, function (err) {
        if (err) {
          reject()
        } else {
          resolve()
        }
      })
    })
  }
}
