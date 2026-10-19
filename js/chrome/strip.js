/* The strip: one pill per tab, in order, and a press that switches (§4.3). */

/* global ipc */

var strip = {
  el: document.getElementById('strip'),
  signature: '',

  initialize: function () {
    /* One listener on the row rather than one per pill: the pills are rebuilt
       whenever the summary changes, and a listener per pill would have to be
       removed with it. The press is delegated to whatever pill it landed in. */
    strip.el.addEventListener('click', function (e) {
      var pill = e.target.closest && e.target.closest('.pill')
      if (pill) {
        strip.onClick(pill)
      }
    })
  },

  /* Rebuilt only when something a pill shows has changed. The summary arrives on
     every tab event, and a rebuild rewrites the row - which drops hover and
     focus along with the DOM - so a title settling on a loading page must not
     cost a new element per event. Covering the title as well as the state is
     deliberate: the tooltip is one of the things a pill shows. */
  update: function (summary) {
    var tabs = (summary && summary.tabs) || []
    var signature = tabs.map(function (tab) {
      return [tab.id, tab.active, tab.accent, tab.title].join('\u0000')
    }).join('|')

    if (signature === strip.signature) {
      return
    }
    strip.signature = signature
    strip.render(tabs)
  },

  render: function (tabs) {
    while (strip.el.firstChild) {
      strip.el.removeChild(strip.el.firstChild)
    }

    tabs.forEach(function (tab) {
      var pill = document.createElement('button')
      pill.className = tab.active ? 'pill active' : 'pill'
      pill.setAttribute('type', 'button')
      pill.setAttribute('role', 'tab')
      pill.setAttribute('aria-selected', tab.active ? 'true' : 'false')
      /* The pill has no text, so the title is what names it: the attribute is the
         tooltip a sighted user gets and the label a screen reader reads. */
      pill.title = tab.title
      pill.setAttribute('aria-label', tab.title)
      pill.dataset.tabId = tab.id

      var bar = document.createElement('span')
      bar.className = 'pill-bar'
      /* The page's own colour, when the page has one; the stylesheet's --accent
         is the fallback, so an uncoloured page still has an active pill. It goes
         on the bar: the pill is the press target and the bar is the drawing. */
      if (tab.accent) {
        bar.style.background = tab.accent
      }

      pill.appendChild(bar)
      strip.el.appendChild(pill)
    })
  },

  onClick: function (pill) {
    /* The id is sent exactly as the summary gave it - a string. js/tabState
       compares ids with ===, so Number() here would name a tab that does not
       exist and the press would do nothing at all. */
    ipc.send('chrome-action', {
      action: 'selectTab',
      tabId: pill.dataset.tabId
    })
  }
}

module.exports = strip
