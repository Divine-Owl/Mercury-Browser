/* The UI page's half of the chrome bridge: the only place tab state leaves this
   page, and the only place the chrome layer's commands arrive.

   Ownership does not move: this page still owns the tabs, and it is still the
   only page that switches one. The chrome layer renders pills from the summary
   below and sends back the name of the tab a press was on; main relays both, so
   neither page has to know the other exists.

   The summary is published, not polled, and coalesced to one message per frame:
   every tab event arrives while a page is loading, a title is settling or a tab
   is closing, and a strip that re-rendered per event would rebuild itself dozens
   of times for one visible change. requestAnimationFrame is the coalescing that
   matches the thing being published - a paint the user can see. */

const ipc = require('electron').ipcRenderer
var browserUI = require('browserUI.js')

var chromeBridge = {
  pending: false,

  initialize: function () {
    /* The selected task's tabs are the strip's tabs, exactly as they are the old
       tab bar's: tasks other than the selected one appear in the overview (M2),
       not in the frame. Every event that can change a pill is listed here rather
       than filtered - publish() is bounded by the frame, so a rebuild that turns
       out to be a no-op costs one comparison. */
    ;['tab-added', 'tab-updated', 'tab-destroyed', 'tab-selected', 'tab-splice',
      'task-added', 'task-destroyed', 'task-updated', 'task-selected'
    ].forEach(function (name) {
      tasks.on(name, function () {
        chromeBridge.publish()
      })
    })

    ipc.on('chrome-action', function (e, data) {
      chromeBridge.applyAction(data)
    })

    chromeBridge.publish()
  },

  publish: function () {
    if (chromeBridge.pending) {
      return
    }
    chromeBridge.pending = true
    requestAnimationFrame(function () {
      chromeBridge.pending = false
      ipc.send('chrome-tabs', chromeBridge.summary())
    })
  },

  /* The pills' own state, and nothing else: a pill is a tab the user can press,
     so it needs an identity, whether it is the one being shown, what the tooltip
     should say, and the page's colour if the page has one (§4.2's "no text, no
     icons: width and colour carry the meaning"). Anything another milestone's
     chrome wants - a favicon, the registrable domain for the address pill, the
     full URL - is added with the consumer that reads it. */
  summary: function () {
    /* window.tabs only exists once a task has been selected, which is session
       restore's job - and restore is asynchronous, so the first publish (one
       frame after this module initializes) can beat it. An empty strip is the
       right answer then; the tab events that arrive as restore loads the session
       publish again. */
    if (!tabs) {
      return { tabs: [] }
    }

    var selected = tabs.getSelected()
    return {
      tabs: tabs.get().map(function (tab) {
        return {
          id: tab.id,
          active: tab.id === selected,
          title: tab.title || '',
          accent: (tab.themeColor && tab.themeColor.color) || (tab.backgroundColor && tab.backgroundColor.color) || null
        }
      })
    }
  },

  applyAction: function (data) {
    if (!data) {
      return
    }

    switch (data.action) {
      case 'selectTab':
        /* A press can arrive after the tab it names is gone - the layer renders
           from the last summary it was sent, so a close and a click can cross.
           An unknown id is therefore not an error, it is a stale pill, and
           tabs.get() is what asks. */
        if (tabs.get(data.tabId)) {
          browserUI.switchToTab(data.tabId)
        }
        break
    }
  }
}

module.exports = chromeBridge
