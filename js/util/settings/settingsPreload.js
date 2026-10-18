window.addEventListener('message', function (e) {
  if (!e.origin.startsWith('mercury://')) {
    return
  }

  if (e.data && e.data.message && e.data.message === 'getSettingsData') {
    ipc.send('getSettingsData')
  }

  if (e.data && e.data.message && e.data.message === 'setSetting') {
    ipc.send('setSetting', { key: e.data.key, value: e.data.value })
  }
})

ipc.on('receiveSettingsData', function (e, data) {
  if (window.location.toString().startsWith('mercury://')) { // probably redundant, but might as well check
    window.postMessage({ message: 'receiveSettingsData', settings: data }, window.location.toString())
  }
})
