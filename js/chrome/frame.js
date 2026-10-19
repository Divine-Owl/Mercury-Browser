/* The frame element and the state class - the one module that knows how the
   chrome's two states differ in the DOM.

   The strip is re-parented rather than duplicated: it is the frame's own content
   while the chrome is closed and the island's first row while it is open (§4.4's
   "the strip grows into the island: one element, one row"), so a pill is one
   element in one row in either state.

   Geometry belongs to main: setGeom() is handed a state main has already decided
   and sized the layer for, and it makes the page agree. */

var frame = {
  el: document.getElementById('frame'),
  island: document.getElementById('island'),
  strip: document.getElementById('strip'),
  setTokens: function (tokens) {
    for (var k in tokens) {
      document.documentElement.style.setProperty(k, tokens[k])
    }
  },
  setGeom: function (state) {
    document.body.classList.toggle('ct-open', state === 'open')
    document.body.classList.toggle('ct-closed', state !== 'open')

    if (state === 'open') {
      frame.island.insertBefore(frame.strip, frame.island.firstChild)
    } else {
      frame.el.appendChild(frame.strip)
    }

    /* The attribute, not a class: the stylesheet spells out #island[hidden], so
       this is the one switch that decides whether the island paints. */
    frame.island.hidden = state !== 'open'
  }
}

module.exports = frame
