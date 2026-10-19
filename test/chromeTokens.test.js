const test = require('node:test')
const assert = require('node:assert')
const chromeTokens = require('../js/chrome/tokens.js')
const chromeSettings = require('../js/chrome/chromeSettings.js')

// §4.10's tokens, plus the ones the plan's table adds for this milestone
// (--island-bg, --island-shadow, --island-radius, --island-border, --strip-gap,
// --strip-pad), §4.12's motion (--t-reveal, --t-retract, --ease-reveal,
// --ease-retract) and the two pill heights: --pill-h-frame is §4.3's formula
// (--strip-h − 8px), and --pill-h-island is this milestone's invention, which
// §4.3 does not state and M3 may revise.
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
  '--island-border',
  '--address-bg',
  '--r-window',
  '--r-page',
  '--strip-gap',
  '--strip-pad',
  '--strip-align',
  '--pill-w',
  '--pill-active-w',
  '--pill-h-frame',
  '--pill-h-island',
  '--t-reveal',
  '--t-retract',
  '--ease-reveal',
  '--ease-retract'
]

// The values the page paints with. --island-shadow is a shadow, so its colour is
// checked as a substring rather than as the whole value.
const COLOUR_TOKENS = ['--frame-bg', '--island-bg', '--text', '--accent']

test('boxHeight answers for every state M1 has', () => {
  // §4.1's chromeBoxH: the layer is exactly as tall as the chrome it shows, plus
  // the room a floating surface's shadow paints in, so these three numbers are
  // what main sizes the WebContentsView to.
  assert.equal(chromeTokens.boxHeight('closed'), 12)
  assert.equal(chromeTokens.boxHeight('open'), 79)
  assert.equal(chromeTokens.boxHeight('cards'), 66)

  assert.equal(chromeTokens.boxHeight('closed'), chromeTokens.frameHeight)
  assert.equal(
    chromeTokens.boxHeight('open'),
    chromeTokens.frameHeight + chromeTokens.islandGap +
      chromeTokens.islandHeight + chromeTokens.shadowRoom
  )
  assert.equal(
    chromeTokens.boxHeight('cards'),
    chromeTokens.frameHeight + chromeTokens.islandGap +
      chromeTokens.cardHeight + chromeTokens.shadowRoom
  )

  // The shadow's room is what keeps the box's own edge from drawing a hard line
  // under the island: a box the exact size of frame + gap + island clips it.
  assert.ok(chromeTokens.shadowRoom > 0, 'the box has to leave the shadow somewhere to paint')
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

  // AMOLED frame (§4.8): the frame's background is true black, not a dark grey
  // - but the island is lifted off it, so the two are never the same colour.
  assert.equal(chromeTokens.dark['--frame-bg'], '#000000')
  for (const variant of ['light', 'dark']) {
    assert.notEqual(
      chromeTokens[variant]['--island-bg'],
      chromeTokens[variant]['--frame-bg'],
      `${variant}: the island's surface is the frame's colour, so it has no lift`
    )
    assert.match(
      chromeTokens[variant]['--island-border'],
      /^rgba?\([\d.,\s]+\)$/i,
      `${variant}['--island-border'] is not a parseable colour`
    )
  }
})

// The island's radius is the capsule rule, not a second number to keep in step:
// half the island's height puts a semicircle at each end of the row. A theme that
// wants a rounded rectangle pins a literal instead, which this only warns about
// by not being able to express it.
test('the island is a capsule by construction', () => {
  for (const variant of ['light', 'dark']) {
    assert.equal(
      chromeTokens[variant]['--island-radius'],
      'calc(var(--island-h) / 2)',
      `${variant}['--island-radius'] is not the capsule rule`
    )
  }
})

// §4.12's motion is in the table because main is a party to it: the retract is
// what keeps the box tall, so the number the page animates over and the number
// main waits are the same number.
test('the motion tokens agree with the numbers main times', () => {
  for (const variant of ['light', 'dark']) {
    assert.equal(parseInt(chromeTokens[variant]['--t-reveal'], 10), chromeTokens.motionReveal)
    assert.equal(parseInt(chromeTokens[variant]['--t-retract'], 10), chromeTokens.motionRetract)
  }
  assert.equal(chromeTokens.light['--ease-reveal'], 'ease-out')
  assert.equal(chromeTokens.light['--ease-retract'], 'ease-in')
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
