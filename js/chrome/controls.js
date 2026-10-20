/* The island's controls: back, forward, reload/stop, the menu, and the window
   buttons (§4.4). The row's third element, after the pills and the address pill.

   Two boundaries, the same ones the rest of this page keeps. Navigation is the UI
   page's business, so those four send `chrome-action` and main relays them - the
   calls are the ones js/navbar/navigationButtons.js makes, so history behaves
   exactly as it always has. The window buttons are not relayed: they are the
   window's own commands, and main's existing handles (main/remoteActions.js) find
   the window from the page that asks, which is why this page can invoke them
   directly. The menu is main's too - this page asks for it at its own position and
   main builds and pops it, which is what the old menu button did.

   The labels are the locale's job, not this file's: the page's localization pass
   reads data-label and sets the tooltip and the accessible name. That attribute is
   not free - a value that is not a locale key throws and takes the whole bundle
   with it - so the buttons carry real keys, and what is left here is the state,
   which the locale knows nothing about (`data-state`, and the icon). */

/* global ipc */

var controls = {
  back: document.getElementById('back-button'),
  forward: document.getElementById('forward-button'),
  reload: document.getElementById('reload-button'),
  menu: document.getElementById('menu-button'),
  minimize: document.getElementById('minimize-button'),
  maximize: document.getElementById('maximize-button'),
  close: document.getElementById('close-button'),

  initialize: function () {
    controls.updateNav({ canGoBack: false, canGoForward: false, loading: false })
    controls.updateWindow({})

    controls.back.addEventListener('click', function () {
      controls.send('goBack')
    })
    controls.forward.addEventListener('click', function () {
      controls.send('goForward')
    })
    controls.reload.addEventListener('click', function () {
      controls.send(controls.reload.dataset.action === 'stop' ? 'stop' : 'reload')
    })
    controls.menu.addEventListener('click', function () {
      var rect = controls.menu.getBoundingClientRect()
      var island = document.getElementById('island').getBoundingClientRect()
      /* The shape js/navbar/menuButton.js sends: where the button is, and the row's
         bottom edge. Main pops the menu there. */
      ipc.send('showSecondaryMenu', { x: Math.round(rect.left), y: Math.round(island.bottom) })
    })
    controls.minimize.addEventListener('click', function () {
      ipc.invoke('minimize')
    })
    controls.maximize.addEventListener('click', function () {
      ipc.invoke(controls.maximize.dataset.action).then(function () {
        /* Ask what the window is now, rather than assuming: whether the window
           manager took the request is its business, and there is not always one
           (a test display has none) - so the button shows what the window says. */
        return ipc.invoke('chrome-window-state')
      }).then(function (state) {
        if (state) {
          controls.updateWindow(state)
        }
      }).catch(function () {
        // the window is on its way out; there is nothing left to show
      })
    })
    controls.close.addEventListener('click', function () {
      ipc.invoke('close')
    })
  },

  /* The icon is the other half of the label: it is what changes when the state
     does. */
  icon: function (button, name) {
    var icon = button.querySelector('i')
    if (icon) {
      icon.className = 'i carbon:' + name
    }
  },

  /* The two history buttons' state, and whether the reload button is a stop button
     instead. Published by main, which knows the tab. */
  updateNav: function (state) {
    state = state || {}
    controls.back.disabled = !state.canGoBack
    controls.forward.disabled = !state.canGoForward

    var loading = !!state.loading
    controls.reload.dataset.action = loading ? 'stop' : 'reload'
    controls.reload.dataset.state = loading ? 'stop' : 'reload'
    /* The icon is the whole of the difference between the two: the locale has no
       "Stop" string, so the stop state keeps the reload label and says itself with
       the icon and the state. M4's localization pass can give it a name. */
    controls.icon(controls.reload, loading ? 'stop' : 'restart')
  },

  /* The window's own state: which of the two maximise buttons it is showing. */
  updateWindow: function (state) {
    state = state || {}
    var restore = !!state.maximized || !!state.fullscreen
    controls.maximize.dataset.state = restore ? 'restore' : 'maximize'
    controls.maximize.dataset.action = restore ? 'unmaximize' : 'maximize'
    /* The glyph follows the state: a square to maximise, two overlapping squares
       to restore - the conventional pair, and the one the old caption buttons
       drew. */
    controls.maximize.classList.toggle('is-restore', restore)
  },

  send: function (action) {
    ipc.send('chrome-action', { action: action })
  }
}

module.exports = controls
