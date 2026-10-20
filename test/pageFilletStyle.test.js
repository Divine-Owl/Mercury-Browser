const test = require('node:test')
const assert = require('node:assert')
const pageFilletStyle = require('../js/util/pageFilletStyle.js')

/* §4.7's page corners. The page paints its own top corners - two fixed
   elements, each one a radial gradient: transparent inside the arc, a 1 px
   hairline on the arc, the frame's colour outside it. The gradients are this
   module's whole output, and the module is pure and shared: the preload builds
   the two backgrounds from it and these tests read it directly, so what the
   page paints and what is pinned here cannot drift apart. */

test('a radius of zero is a size of zero, which the caller removes', () => {
  // Zero is not "a very small corner": it is no corner at all, and the preload
  // takes the elements out of the document rather than painting a 0 px box.
  assert.equal(pageFilletStyle(0, '#f6f6f6', 'rgba(0, 0, 0, 0.12)').size, '0px')
})

test('the size is the radius, in pixels', () => {
  assert.equal(pageFilletStyle(20, '#f6f6f6', 'rgba(0, 0, 0, 0.12)').size, '20px')
  assert.equal(pageFilletStyle(100, '#f6f6f6', 'rgba(0, 0, 0, 0.12)').size, '100px')
})

test('each gradient carries both colours and the hairline on the arc', () => {
  const style = pageFilletStyle(20, '#f6f6f6', 'rgba(0, 0, 0, 0.12)')

  for (const gradient of [style.left, style.right]) {
    assert.match(gradient, /^radial-gradient\(circle /)

    // the frame's colour, outside the arc
    assert.ok(gradient.includes('#f6f6f6'), 'the outside colour is missing')

    // the hairline, on the arc
    assert.ok(gradient.includes('rgba(0, 0, 0, 0.12)'), 'the hairline colour is missing')

    // transparent inside the arc
    assert.ok(gradient.includes('rgba(0, 0, 0, 0)'), 'the inside of the arc is not transparent')

    /* The hairline is a 1 px band, and it is bounded by two stops: the
       transparent one and the hairline one, a pixel apart on the arc. */
    assert.equal(
      gradient.split('calc(100% - 1px)').length - 1,
      2,
      'the hairline is not a 1 px band on the arc'
    )
  }
})

test('the two gradients mirror each other', () => {
  const style = pageFilletStyle(20, '#f6f6f6', 'rgba(0, 0, 0, 0.12)')

  // the left corner's gradient is centred in its inner corner, the right one's
  // in the other inner corner
  assert.match(style.left, /at 100% 100%/)
  assert.match(style.right, /at 0% 100%/)

  // and they are the same gradient, mirrored - not two that happen to look alike
  assert.equal(style.right, style.left.replace('at 100% 100%', 'at 0% 100%'))
})

test('the arc is the radius, not the diagonal', () => {
  /* The element is radius x radius with the gradient's centre in its inner
     corner, so the arc the hairline sits on is the circle of that radius around
     that centre - the arc a rounded corner is made of, running from (radius, 0)
     to (0, radius).

     The ending shape has to be the radius for that to be true. farthest-side is
     it: the distance from the centre to the far sides of such an element.
     farthest-corner would be the diagonal - √2 times the radius - and the
     hairline would land outside the corner altogether, leaving the corner
     unpainted. */
  const style = pageFilletStyle(20, '#f6f6f6', 'rgba(0, 0, 0, 0.12)')

  for (const gradient of [style.left, style.right]) {
    assert.match(gradient, /circle farthest-side at /)
  }
})
