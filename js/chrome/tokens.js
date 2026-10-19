/* The chrome's token table: the appearance contract of §4.10, and the geometry
   main sizes the chrome layer with.

   Every colour and length the chrome page paints with is a key in `light` and
   in `dark`, and both variants carry the same keys: the page swaps one table for
   the other wholesale when the theme changes, so a key only one variant had
   would leave a declaration unset the moment the theme flipped.

   --pill-h-island is this milestone's addition, not §4.10's: §4.3 states the
   frame's drawn pill height (clamp(3px, --strip-h − 8px, 12px)) but not the
   island's, and M3 may revise it. --r-page is only the fallback the page paints
   with before main has pushed the pageCornerRadius setting - the setting rules
   (§4.7).

   The island is a **lifted surface**, not a second copy of the frame's colour: it
   carries its own --island-bg (a step off --frame-bg), a --island-border and a
   deeper --island-shadow, which is what makes it read as an object over the page
   instead of a hole in the frame. --address-bg is the same idea one level in: the
   address pill's own surface, a step off the island it sits on. The dark variant
   keeps §4.8's AMOLED frame and lifts the island off it (the maintainer's call of
   2026-10-19, after comparing this table against the layering spike's: the spike's
   island was a surface with its own depth, and black-on-black had thrown that
   away). --island-radius is the capsule rule - half the island's height, so the
   row's ends are semicircles; a theme that wants a rounded rectangle pins a
   literal instead.

   The numbers main needs are fields beside the CSS strings (the tests assert the
   two agree) - including §4.12's motion, because the box is kept tall until the
   retract has run and main is what times that - and boxHeight() is the one place
   the chrome box's height is computed: main sizes the layer to it and the
   stylesheet's absolute positions follow from the same lengths. */

var chromeTokens = {
  frameHeight: 12,
  islandGap: 6,
  islandHeight: 53,
  cardHeight: 40,

  /* How far the floating surface's shadow is allowed to paint below it, inside
     the chrome's own box. Without it the box's edge cuts the shadow off and the
     island gets a hard line under it; the spike reserved the same 8 px. It is
     not a token: nothing in the page's CSS reads it, and the shadow paints where
     it paints - this is only how tall main makes the layer. */
  shadowRoom: 8,

  motionReveal: 140,
  motionRetract: 120,

  light: {
    '--strip-h': '12px',
    '--island-h': '53px',
    '--island-gap': '6px',
    '--frame-bg': '#f6f6f6',
    '--hairline': 'rgba(0, 0, 0, 0.12)',
    '--pill': 'rgba(0, 0, 0, 0.20)',
    '--text': '#1c1c1e',
    '--accent': '#4457c8',
    '--island-bg': '#ffffff',
    '--island-border': 'rgba(0, 0, 0, 0.10)',
    '--island-shadow': '0 16px 46px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.10)',
    '--island-radius': 'calc(var(--island-h) / 2)',
    '--address-bg': '#f1f1f4',
    '--r-window': '12px',
    '--r-page': '20px',
    '--strip-gap': '4px',
    '--strip-pad': '6px',
    '--strip-align': 'safe center',
    '--pill-w': '26px',
    '--pill-active-w': '38px',
    '--pill-h-frame': '4px',
    '--pill-h-island': '16px',

    /* §4.12's motion, as tokens: the island drops in from the frame's edge and
       retracts the same way, and main reads motionRetract to know how long the
       box has to stay tall. */
    '--t-reveal': '140ms',
    '--t-retract': '120ms',
    '--ease-reveal': 'ease-out',
    '--ease-retract': 'ease-in'
  },

  /* AMOLED frame: the frame's background is true black, so the window's own edge
     dissolves into an OLED panel and the hairline and neutrals carry the
     structure (§4.8). The island is lifted off it - its own surface, border and
     shadow - so the chrome is never one black field with a hole in it. */
  dark: {
    '--strip-h': '12px',
    '--island-h': '53px',
    '--island-gap': '6px',
    '--frame-bg': '#000000',
    '--hairline': 'rgba(255, 255, 255, 0.16)',
    '--pill': 'rgba(255, 255, 255, 0.28)',
    '--text': '#f2f2f7',
    '--accent': '#8f9dff',
    '--island-bg': '#23252b',
    '--island-border': 'rgba(255, 255, 255, 0.14)',
    '--island-shadow': '0 16px 46px rgba(0, 0, 0, 0.62), 0 2px 8px rgba(0, 0, 0, 0.45)',
    '--island-radius': 'calc(var(--island-h) / 2)',
    '--address-bg': '#1a1c22',
    '--r-window': '12px',
    '--r-page': '20px',
    '--strip-gap': '4px',
    '--strip-pad': '6px',
    '--strip-align': 'safe center',
    '--pill-w': '26px',
    '--pill-active-w': '38px',
    '--pill-h-frame': '4px',
    '--pill-h-island': '16px',

    /* §4.12's motion, as tokens: the island drops in from the frame's edge and
       retracts the same way, and main reads motionRetract to know how long the
       box has to stay tall. */
    '--t-reveal': '140ms',
    '--t-retract': '120ms',
    '--ease-reveal': 'ease-out',
    '--ease-retract': 'ease-in'
  },

  /* The chrome box's height for a state (§4.1's chromeBoxH). 'closed' is the
     frame alone; 'open' adds the island's gap, row and the room its shadow
     paints in; 'cards' is Ctrl+Tab's row of cards, which M3 opens - it floats
     the same way, so it gets the same room. An unknown state is treated as
     closed, because a chrome box never opens on a state nobody has defined. */
  boxHeight: function (state) {
    if (state === 'open') {
      return chromeTokens.frameHeight + chromeTokens.islandGap +
        chromeTokens.islandHeight + chromeTokens.shadowRoom
    }
    if (state === 'cards') {
      return chromeTokens.frameHeight + chromeTokens.islandGap +
        chromeTokens.cardHeight + chromeTokens.shadowRoom
    }
    return chromeTokens.frameHeight
  }
}

if (typeof module !== 'undefined') {
  module.exports = chromeTokens
}
