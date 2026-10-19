/* The address pill: the island's middle element, and the only place a URL is
   typed (§4.4).

   At rest it names the page - its favicon, when the summary has one, and its
   registrable domain - and on hover it offers the full URL as a tooltip. A press
   begins editing with the text selected; Enter navigates; Escape cancels the
   edit, and a second Escape retracts.

   Two boundaries, both deliberate. Main owns the box, so the pill is opened by a
   message rather than by its own guess at the pointer. And the UI page owns the
   tabs, so a navigation leaves as a command instead of this page growing a
   second submit path of its own. */

/* global ipc */

var address = {
  el: document.getElementById('address'),
  input: document.getElementById('address-input'),
  favicon: document.getElementById('address-favicon'),

  /* What the pill shows at rest, and what an edit starts from. Kept here rather
     than re-read from the input: an edit can be open while the page navigates
     underneath it, and the resting text must not follow. */
  editing: false,
  rest: '',
  fullUrl: '',

  initialize: function () {
    address.el.addEventListener('click', function () {
      if (!address.editing) {
        address.beginEdit()
      }
    })

    address.input.addEventListener('keydown', function (e) {
      address.onKeyDown(e)
    })

    /* Clicking away is the page's business, but the pill still has to stop being
       an edit: a field left holding half a URL would read as the page's address. */
    address.input.addEventListener('blur', function () {
      address.endEdit()
    })
  },

  /* The strip's summary is the same one this needs: the active tab's domain at
     rest, its full URL on hover and while editing. An open edit is never
     overwritten - the events that publish a summary fire on every tab change,
     including the one the edit itself causes. */
  update: function (summary) {
    address.fullUrl = (summary && summary.fullUrl) || ''
    address.rest = (summary && summary.atRest) || ''

    if (address.editing) {
      return
    }

    address.input.value = address.rest
    address.el.title = address.fullUrl

    if (summary && summary.favicon) {
      address.favicon.src = summary.favicon
      address.el.classList.add('has-favicon')
    } else {
      address.el.classList.remove('has-favicon')
    }
  },

  beginEdit: function () {
    address.editing = true
    address.input.readOnly = false
    address.input.value = address.fullUrl
    address.input.select()
    address.input.focus()
  },

  endEdit: function () {
    address.editing = false
    address.input.readOnly = true
    address.input.value = address.rest
  },

  onKeyDown: function (e) {
    if (e.key === 'Enter') {
      var value = address.input.value.trim()
      address.endEdit()

      if (value && value !== address.fullUrl) {
        /* The submit path is the UI page's own: the same event the old editor
           emitted, which parses the value and hands it to the view manager. */
        ipc.send('chrome-action', { action: 'navigate', value: value })
      }
      /* Either way the box is done with. The URL is being loaded, or nothing was
         changed - and a box left open over a page that is not being edited is a
         box the user has to close themselves. */
      ipc.send('chrome-action', { action: 'retract' })
      return
    }

    if (e.key === 'Escape') {
      /* §4.4: inside an edit, Escape cancels it; outside one, it retracts. The
         "second Escape retracts" is this rule read twice. */
      if (address.editing) {
        address.endEdit()
      } else {
        ipc.send('chrome-action', { action: 'retract' })
      }
    }
  },

  /* main's `chrome-focus-address`: the box is open by the time this arrives, and
     the pill is told to edit - with a prefill where the caller had one (a bang, a
     bookmark tag), which M1's pill simply holds until the suggestion list lands. */
  focus: function (value) {
    address.beginEdit()
    if (value) {
      address.input.value = value
      address.input.setSelectionRange(value.length, value.length)
    }
  }
}

module.exports = address
