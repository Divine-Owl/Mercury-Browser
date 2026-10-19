/* Reports where the pointer is, so main can decide whether the chrome should be
   showing (§4.6).

   This is the page half: the coordinates are this page's own, and main adds the
   view's offset to get the window's. That is the only correct reading of
   clientY - a page cannot know where its view sits in the window, and a browser
   that guessed would open the island at the wrong place in any window with a
   margin above the page.

   The main frame only: an iframe's coordinates are the iframe's, and a report
   from one would be added the same offset - twice wrong. The listener is passive
   (it never prevents anything) and captured (a page that stops propagation must
   not stop the chrome from knowing where the pointer is).

   Throttled to a report every 50 ms: the decision is a threshold on y, so a
   hundred reports per second of the same finger's wobble would decide nothing
   new, and this is the only chatty message in the protocol. */

/* global ipc */

if (window.parent === window) {
  var lastPointerReport = 0

  document.addEventListener('mousemove', function (e) {
    var now = Date.now()
    if (now - lastPointerReport < 50) {
      return
    }
    lastPointerReport = now
    ipc.send('page-pointer', { y: Math.round(e.clientY) })
  }, { passive: true, capture: true })
}
