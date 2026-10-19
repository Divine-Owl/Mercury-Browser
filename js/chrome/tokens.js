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

   The numbers main needs are fields beside the CSS strings (the tests assert the
   two agree), and boxHeight() is the one place the chrome box's height is
   computed: main sizes the layer to it and the stylesheet's absolute positions
   follow from the same lengths. */

var chromeTokens = {
  frameHeight: 12,
  islandGap: 12,
  islandHeight: 53,
  cardHeight: 40,

  light: {
    '--strip-h': '12px',
    '--island-h': '53px',
    '--island-gap': '12px',
    '--frame-bg': '#f6f6f6',
    '--hairline': 'rgba(0, 0, 0, 0.12)',
    '--pill': 'rgba(0, 0, 0, 0.20)',
    '--text': '#1c1c1e',
    '--accent': '#4457c8',
    '--island-bg': '#f6f6f6',
    '--island-shadow': '0 2px 12px rgba(0, 0, 0, 0.18)',
    '--island-radius': '12px',
    '--r-window': '12px',
    '--r-page': '20px',
    '--strip-gap': '4px',
    '--strip-pad': '6px',
    '--strip-align': 'safe center',
    '--pill-w': '26px',
    '--pill-active-w': '38px',
    '--pill-h-frame': '4px',
    '--pill-h-island': '16px'
  },

  /* AMOLED: the backgrounds are true black, so the chrome dissolves into an OLED
     panel and the hairline and neutrals carry the structure instead (§4.8). */
  dark: {
    '--strip-h': '12px',
    '--island-h': '53px',
    '--island-gap': '12px',
    '--frame-bg': '#000000',
    '--hairline': 'rgba(255, 255, 255, 0.16)',
    '--pill': 'rgba(255, 255, 255, 0.28)',
    '--text': '#f2f2f7',
    '--accent': '#8f9dff',
    '--island-bg': '#000000',
    '--island-shadow': '0 2px 14px rgba(0, 0, 0, 0.85)',
    '--island-radius': '12px',
    '--r-window': '12px',
    '--r-page': '20px',
    '--strip-gap': '4px',
    '--strip-pad': '6px',
    '--strip-align': 'safe center',
    '--pill-w': '26px',
    '--pill-active-w': '38px',
    '--pill-h-frame': '4px',
    '--pill-h-island': '16px'
  },

  /* The chrome box's height for a state (§4.1's chromeBoxH). 'closed' is the
     frame alone; 'open' adds the island's gap and row; 'cards' is Ctrl+Tab's row
     of cards, which M3 opens. An unknown state is treated as closed, because a
     chrome box never opens on a state nobody has defined. */
  boxHeight: function (state) {
    if (state === 'open') {
      return chromeTokens.frameHeight + chromeTokens.islandGap + chromeTokens.islandHeight
    }
    if (state === 'cards') {
      return chromeTokens.frameHeight + chromeTokens.islandGap + chromeTokens.cardHeight
    }
    return chromeTokens.frameHeight
  }
}

if (typeof module !== 'undefined') {
  module.exports = chromeTokens
}
