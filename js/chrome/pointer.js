/* The chrome page's own pointer reports (§4.6).

   The same throttle as the page's preload, and the same shape of report, so main
   has one kind of message to read. The difference is the meaning of a report from
   here: while the box is open this page is on top of everything, so a report with
   a y inside the band is the pointer on the island's own box - the one place the
   rule leaves the state alone.

   `leave` (the pointer left the window) is sent but ignored in M1: the corridor
   that would use it arrives with M3, and a report with no consumer is cheaper
   than a protocol change later. main's rule ignores unknown reports by
   construction - it reads `source` and `y` and nothing else. */

/* global ipc */

var chromePointer = {
  initialize: function () {
    var lastReport = 0

    document.addEventListener('mousemove', function (e) {
      var now = Date.now()
      if (now - lastReport < 50) {
        return
      }
      lastReport = now
      ipc.send('chrome-pointer', { y: Math.round(e.clientY) })
    }, { passive: true, capture: true })

    document.addEventListener('mouseout', function (e) {
      if (e.relatedTarget === null) {
        ipc.send('chrome-pointer', { y: Math.round(e.clientY), leave: true })
      }
    })
  }
}

module.exports = chromePointer
