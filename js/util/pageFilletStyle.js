/* The two gradients a page paints for its own top corners (§4.7).

   The page paints its corners rather than an overlay doing it for it: nothing
   covers the page and no input is redirected. Two fixed elements at the top of
   the document, each one a radial gradient - transparent inside the arc, a 1 px
   hairline on the arc, the frame's colour outside it.

   The shape of the gradient is not obvious, so it is worth saying out loud. The
   element is radius x radius with the gradient's centre in its inner corner, so
   the arc the hairline sits on is the circle of that radius around that centre -
   the arc a rounded corner is made of, running from (radius, 0) to (0, radius).
   The ending shape is what puts the hairline on it: farthest-side, which for an
   element of that size with the centre in a corner is exactly the radius - the
   distance from the centre to the far sides. (farthest-corner would be the
   diagonal, √2 times the radius, and the hairline would land outside the corner
   altogether, leaving the corner unpainted.)

   Pure, and shared: the preload builds the two backgrounds from it, and the unit
   tests read it directly, so what the page paints and what is pinned cannot
   drift apart. It is concatenated into the preload bundle, where `module` may
   not exist, so the export is guarded. */

function pageFilletStyle (radius, outside, hairline) {
  var left = 'radial-gradient(circle farthest-side at 100% 100%, ' +
    'rgba(0, 0, 0, 0) calc(100% - 1px), ' + hairline + ' calc(100% - 1px), ' +
    hairline + ' 100%, ' + outside + ' 100%)'

  /* The right corner is the same gradient, mirrored: the element is at the other
     end of the page, so its inner corner is on the other side, and everything
     else about the arc is the same. Mirroring the string rather than writing a
     second one is what keeps the two from drifting apart. */
  var right = left.replace('at 100% 100%', 'at 0% 100%')

  return { left: left, right: right, size: radius + 'px' }
}

if (typeof module !== 'undefined') {
  module.exports = pageFilletStyle
}
