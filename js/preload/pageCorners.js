/* The page paints its own top corners (§4.7).

   Two fixed elements at the top of the document, each one a radial gradient:
   transparent inside the arc, a 1 px hairline on the arc, the frame's colour
   outside it. The page does this rather than having an overlay do it for it,
   because nothing then covers the page and no input is redirected - the corner
   stays clickable, which an overlay would not.

   The main frame only: an iframe's corners are the iframe's, and painting them
   would put a second frame's arc inside the page.

   Every style is set through the element's own style object, never through a
   stylesheet and never through innerHTML: a page's Content-Security-Policy
   must not be able to stop the browser from painting its own frame, and the
   preload's styles are the one thing a hostile page cannot argue with.

   The style itself comes from main - the radius is a setting, and the two
   colours are the theme's - so the document asks for it when it loads (a
   navigating document asks again, which is how a view that was created after
   the last push still gets it) and main pushes it again whenever the setting
   or the theme changes. */

/* global ipc, pageFilletStyle */

/* The two corner elements, while they are in the document. */
var pageCorners = null

/* One corner: a fixed box of the radius, in the page's own top corner, with
   the gradient painted into it. */
function pageCornerElement (size, background, side) {
  var el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.position = 'fixed'
  el.style.top = '0'
  el.style.width = size
  el.style.height = size
  el.style[side] = '0'
  el.style.pointerEvents = 'none'
  el.style.zIndex = '2147483647'
  el.style.background = background
  return el
}

function removePageCorners () {
  if (!pageCorners) {
    return
  }
  pageCorners.forEach(function (el) {
    if (el.parentNode) {
      el.parentNode.removeChild(el)
    }
  })
  pageCorners = null
}

/* The radius decides everything: at zero there is no corner, and the elements
   are taken out of the document rather than left behind as a 0 px box. */
function renderPageCorners (style) {
  removePageCorners()

  if (!style || !(style.radius > 0)) {
    return
  }

  var fillet = pageFilletStyle(style.radius, style.outside, style.hairline)
  var left = pageCornerElement(fillet.size, fillet.left, 'left')
  var right = pageCornerElement(fillet.size, fillet.right, 'right')

  document.documentElement.appendChild(left)
  document.documentElement.appendChild(right)
  pageCorners = [left, right]
}

if (window.parent === window) {
  ipc.on('pageStyle', function (e, style) {
    renderPageCorners(style)
  })

  /* The document asks for the style when it loads. A document that navigates
     asks again, which is what makes a view that was created after main's last
     push still paint the right corners. */
  document.addEventListener('DOMContentLoaded', function () {
    ipc.send('pageStyleRequest')
  })
}
