const test = require('node:test')
const assert = require('node:assert')
const chromeTokens = require('../js/chrome/tokens.js')
const chromeSettings = require('../js/chrome/chromeSettings.js')

// §4.10's tokens, plus the five the plan's table adds for this milestone
// (--island-bg, --island-shadow, --island-radius, --strip-gap, --strip-pad) and
// the two pill heights: --pill-h-frame is §4.3's formula (--strip-h − 8px), and
// --pill-h-island is this milestone's invention, which §4.3 does not state and
// M3 may revise. §4.12's motion timings are deliberately absent - M1 has no
// motion.
//
// The variants must carry the same keys: the page swaps one table for the other
// wholesale on a theme change, so a key only one variant has would leave a
// declaration unset (and inherit nothing) the moment the theme flips.
const CONTRACT_KEYS = [
  '--strip-h',
  '--island-h',
  '--island-gap',
  '--frame-bg',
  '--hairline',
  '--pill',
  '--text',
  '--accent',
  '--island-bg',
  '--island-shadow',
  '--island-radius',
  '--r-window',
  '--r-page',
  '--strip-gap',
  '--strip-pad',
  '--strip-align',
  '--pill-w',
  '--pill-active-w',
  '--pill-h-frame',
  '--pill-h-island'
]

// The values the page paints with. --island-shadow is a shadow, so its colour is
// checked as a substring rather than as the whole value.
const COLOUR_TOKENS = ['--frame-bg', '--island-bg', '--text', '--accent']

test('boxHeight answers for every state M1 has', () => {
  // §4.1's chromeBoxH: the layer is exactly as tall as the chrome it shows, so
  // these three numbers are what main sizes the WebContentsView to.
  assert.equal(chromeTokens.boxHeight('closed'), 12)
  assert.equal(chromeTokens.boxHeight('open'), 77)
  assert.equal(chromeTokens.boxHeight('cards'), 64)

  assert.equal(chromeTokens.boxHeight('closed'), chromeTokens.frameHeight)
  assert.equal(
    chromeTokens.boxHeight('open'),
    chromeTokens.frameHeight + chromeTokens.islandGap + chromeTokens.islandHeight
  )
  assert.equal(
    chromeTokens.boxHeight('cards'),
    chromeTokens.frameHeight + chromeTokens.islandGap + chromeTokens.cardHeight
  )
})

// The frameHeight field is the one main hands to chromeReveal as the band's
// height; the stylesheet gets the same number as --strip-h. A drift between the
// two would put the hidden zone somewhere other than the frame's own edge, which
// is the one thing SC2 measures.
test('the frame geometry fields and the CSS lengths agree', () => {
  assert.equal(parseInt(chromeTokens.light['--strip-h'], 10), chromeTokens.frameHeight)
  assert.equal(parseInt(chromeTokens.light['--island-h'], 10), chromeTokens.islandHeight)
  assert.equal(parseInt(chromeTokens.light['--island-gap'], 10), chromeTokens.islandGap)
  assert.equal(parseInt(chromeTokens.dark['--strip-h'], 10), chromeTokens.frameHeight)
  assert.equal(parseInt(chromeTokens.dark['--island-h'], 10), chromeTokens.islandHeight)
  assert.equal(parseInt(chromeTokens.dark['--island-gap'], 10), chromeTokens.islandGap)

  // §4.3: the drawn pill height is `--strip-h − 8px`, clamped - the clamp is the
  // theme's business, the formula is this table's.
  assert.equal(chromeTokens.light['--pill-h-frame'], String(chromeTokens.frameHeight - 8) + 'px')
  assert.equal(chromeTokens.dark['--pill-h-frame'], String(chromeTokens.frameHeight - 8) + 'px')
})

test('every contract key is in both variants', () => {
  for (const variant of ['light', 'dark']) {
    for (const key of CONTRACT_KEYS) {
      const value = chromeTokens[variant][key]
      assert.equal(typeof value, 'string', `${variant}['${key}'] is missing`)
      assert.ok(value.length > 0, `${variant}['${key}'] is empty`)
    }
  }

  assert.deepEqual(
    Object.keys(chromeTokens.dark).sort(),
    Object.keys(chromeTokens.light).sort(),
    'the variants must carry the same keys, and only those'
  )
})

test('the colour tokens are real CSS colours', () => {
  for (const variant of ['light', 'dark']) {
    for (const key of COLOUR_TOKENS) {
      assert.match(
        chromeTokens[variant][key],
        /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\([\d.,\s]+\))$/i,
        `${variant}['${key}'] is not a parseable colour`
      )
    }
    assert.match(
      chromeTokens[variant]['--hairline'],
      /^rgba?\([\d.,\s]+\)$/i,
      `${variant}['--hairline'] is not a parseable colour`
    )
    assert.match(
      chromeTokens[variant]['--pill'],
      /^rgba?\([\d.,\s]+\)$/i,
      `${variant}['--pill'] is not a parseable colour`
    )
    // The shadow's colour sits inside a box-shadow value.
    assert.match(
      chromeTokens[variant]['--island-shadow'],
      /rgba?\([\d.,\s]+\)/i,
      `${variant}['--island-shadow'] names no colour`
    )
  }

  // AMOLED dark (§4.8): the backgrounds are true black, not a dark grey.
  assert.equal(chromeTokens.dark['--frame-bg'], '#000000')
  assert.equal(chromeTokens.dark['--island-bg'], '#000000')
})

// --r-page is the fallback the page paints with before main has pushed the
// setting; if it disagreed with the setting's default, the first paint of a
// fresh profile would carry a different radius than the one it settles into.
test('the --r-page fallback is the setting it falls back from', () => {
  for (const variant of ['light', 'dark']) {
    assert.equal(parseInt(chromeTokens[variant]['--r-page'], 10), chromeSettings.pageCornerRadius.default)
  }
  assert.equal(parseInt(chromeTokens.light['--r-window'], 10), 12)
})
