/* The chrome page's entry, the counterpart of js/default.js for this page.

   Main owns the chrome's state and geometry; this page paints what it is told
   and reports where the pointer is (Task 4). The one thing it decides for itself
   is the light table it paints with before main has spoken, because the page is
   visible for the time between the bundle running and the chrome-ready handshake
   below reaching main. */

var electron = require('electron')
var ipc = electron.ipcRenderer

window.electron = electron
window.ipc = ipc

if (navigator.platform === 'MacIntel') {
  document.body.classList.add('mac')
  window.platformType = 'mac'
} else if (navigator.platform === 'Win32') {
  document.body.classList.add('windows')
  window.platformType = 'windows'
} else {
  document.body.classList.add('linux')
  window.platformType = 'linux'
}

var chromeTokens = require('chrome/tokens.js')
var frame = require('chrome/frame.js')
var pointer = require('chrome/pointer.js')

frame.setTokens(chromeTokens.light)

// the pointer on the chrome's own box: the frame band, or the island while it is open
pointer.initialize()

/* Main's pushes across M1. The two this milestone consumes are wired; the rest
   are registered now because the handshake is this file's last line and a
   message that arrives with no listener is lost - the modules that read them
   arrive with the tasks that own them (chrome-tabs in Task 5, chrome-nav-state
   and chrome-focus-address in Task 6, chrome-window-state in Task 7). */
ipc.on('chrome-tokens', function (e, data) {
  frame.setTokens(data.tokens)
})

ipc.on('chrome-geom', function (e, data) {
  frame.setGeom(data.state)
})

ipc.on('chrome-tabs', function () { /* the strip's pills, Task 5 */ })
ipc.on('chrome-nav-state', function () { /* the island's navigation controls, Task 6 */ })
ipc.on('chrome-window-state', function () { /* the island's window controls, Task 7 */ })
ipc.on('chrome-focus-address', function () { /* the address pill, Task 6 */ })

/* The handshake: main pushes tokens and geometry on it, so nothing may be
   registered after it. */
ipc.send('chrome-ready')
