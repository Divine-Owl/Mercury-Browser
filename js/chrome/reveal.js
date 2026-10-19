/* Main's reveal decision, pure (§4.6).

   M1's remainder of §4.6: the pointer either summons the island, leaves it, or
   is on the chrome's own box. There is no corridor, no grace timer and no
   overshoot rule yet - those, and the 'cards' state, arrive with M3, and they
   extend this function rather than wrap it: main calls next() with the last
   report and applies the answer, so the rules grow here and can be re-tested
   here.

   state:  'closed' | 'open'
   report: { source: 'chrome' | 'page' | 'blur', y: window coordinates through
             the frame's top edge, frameHeight, tolerance }
   returns 'open' | 'closed' | 'stay'; 'stay' means the state is already right. */

var chromeReveal = {
  next: function (state, report) {
    /* A blur is never a corridor bug: whatever the pointer did, the window is no
       longer the foreground window, so the chrome is not what the user is
       looking at. A closed chrome is left alone (§4.6). */
    if (report.source === 'blur') {
      return state === 'closed' ? 'stay' : 'closed'
    }

    /* The hidden zone: the frame band, widened downward by hoverTolerance. The
       boundary row is inside it, which is what makes the frame itself the summon
       target at the default tolerance of 0. */
    var zone = report.frameHeight + report.tolerance
    if (report.y <= zone) {
      return state === 'open' ? 'stay' : 'open'
    }

    /* Below the zone only a report from the page can mean the pointer left the
       chrome. A report from the chrome itself is the pointer on the island's own
       box - the box is taller than the frame while it is open - and the island
       keeps its pointer. Leaving the box's bottom is the page's report to make. */
    if (report.source === 'page') {
      return state === 'open' ? 'closed' : 'stay'
    }
    return 'stay'
  }
}

if (typeof module !== 'undefined') {
  module.exports = chromeReveal
}
