const test = require('node:test')
const assert = require('node:assert')
const chromeReveal = require('../js/chrome/reveal.js')
const chromeSettings = require('../js/chrome/chromeSettings.js')
const chromeTokens = require('../js/chrome/tokens.js')

const FRAME = chromeTokens.frameHeight

function report (source, y, tolerance) {
  return {
    source: source,
    y: y,
    frameHeight: FRAME,
    tolerance: tolerance === undefined ? 0 : tolerance
  }
}

// state, source, y, tolerance, expected. Each row is a sentence from §4.6 or
// from the plan's M1 remainder of it.
const CASES = [
  // the frame band summons the island, and the band's last row is inside it
  ['closed', 'chrome', 0, 0, 'open'],
  ['closed', 'chrome', 6, 0, 'open'],
  ['closed', 'chrome', 12, 0, 'open'],
  ['open', 'chrome', 6, 0, 'stay'],

  // at tolerance 0 the page cannot summon it: the first row below the band is
  // already outside the zone
  ['closed', 'page', 12, 0, 'open'],
  ['closed', 'page', 13, 0, 'stay'],
  ['open', 'page', 13, 0, 'closed'],

  // tolerance 24 widens the zone 24 px downward - the setting is why the
  // remaining rows move, and only for as far as it is set
  ['closed', 'page', 20, 24, 'open'],
  ['open', 'page', 20, 24, 'stay'],
  ['open', 'page', 36, 24, 'stay'],
  ['open', 'page', 37, 24, 'closed'],
  ['closed', 'page', 37, 24, 'stay'],

  // a chrome report below the band while the island is open is the pointer on
  // the island's own box: the island keeps it
  ['open', 'chrome', 13, 0, 'stay'],
  ['open', 'chrome', 40, 0, 'stay'],
  ['closed', 'chrome', 40, 0, 'stay'],

  // window blur closes an open island and does not disturb a closed one
  ['open', 'blur', 0, 0, 'closed'],
  ['closed', 'blur', 0, 0, 'stay']
]

for (const [state, source, y, tolerance, expected] of CASES) {
  test(`reveal: ${state} + ${source} at y=${y} with tolerance ${tolerance} -> ${expected}`, () => {
    assert.equal(chromeReveal.next(state, report(source, y, tolerance)), expected)
  })
}

test('reveal is a decision, not a store', () => {
  // next() must not mutate its arguments: main keeps the state, the function
  // only says what to do with it. The same report answered twice must answer the
  // same way, which a stored state inside the module would break.
  const open = report('chrome', 6)
  assert.equal(chromeReveal.next('closed', open), 'open')
  assert.equal(chromeReveal.next('closed', open), 'open')
  assert.deepEqual(open, report('chrome', 6))
})

// chromeSettings is the single declaration of the two new settings (§4.10), read
// by main and by Tasks 9/10's settings page. 'stay' is not a value it can
// produce, so a clamp that returns the default on nonsense is what keeps a
// hand-edited settings file from taking the chrome off the screen.
test('the chrome settings carry their declared range', () => {
  assert.equal(chromeSettings.pageCornerRadius.key, 'pageCornerRadius')
  assert.equal(chromeSettings.pageCornerRadius.default, 20)
  assert.equal(chromeSettings.pageCornerRadius.min, 0)
  assert.equal(chromeSettings.pageCornerRadius.max, 100)

  assert.equal(chromeSettings.hoverTolerance.key, 'hoverTolerance')
  assert.equal(chromeSettings.hoverTolerance.default, 0)
  assert.equal(chromeSettings.hoverTolerance.min, 0)
  assert.equal(chromeSettings.hoverTolerance.max, 24)
})

test('the clamps round to integers inside the range and default on nonsense', () => {
  // Task 10's four cases.
  assert.equal(chromeSettings.hoverTolerance.clamp(25), 24)
  assert.equal(chromeSettings.hoverTolerance.clamp(-3), 0)
  assert.equal(chromeSettings.hoverTolerance.clamp('wide'), 0)
  assert.equal(chromeSettings.hoverTolerance.clamp(12.6), 13)

  assert.equal(chromeSettings.pageCornerRadius.clamp(1000), 100)
  assert.equal(chromeSettings.pageCornerRadius.clamp(-1), 0)
  assert.equal(chromeSettings.pageCornerRadius.clamp(19.5), 20)

  // Unset settings read as undefined; a settings file anyone has edited can hold
  // anything. Both fall back to the default rather than to a number.
  assert.equal(chromeSettings.pageCornerRadius.clamp(undefined), 20)
  assert.equal(chromeSettings.hoverTolerance.clamp(undefined), 0)
  assert.equal(chromeSettings.pageCornerRadius.clamp(null), 20)
  assert.equal(chromeSettings.pageCornerRadius.clamp(NaN), 20)
  assert.equal(chromeSettings.pageCornerRadius.clamp(Infinity), 20)
  assert.equal(chromeSettings.hoverTolerance.clamp(''), 0)

  // An <input type="number"> hands its value back as a string, so a numeric
  // string is a number here.
  assert.equal(chromeSettings.pageCornerRadius.clamp('40'), 40)
  assert.equal(chromeSettings.hoverTolerance.clamp('24'), 24)
})
