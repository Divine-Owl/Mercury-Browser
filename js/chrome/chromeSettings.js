/* The two settings this milestone adds (§4.10), declared once.

   main reads them - the reveal band's tolerance, the page's corner radius - and
   Tasks 9 and 10's settings page writes them, so the range and the clamp live
   here rather than in either caller: two clamps that disagreed would be one
   setting that means two things.

   The clamp's rule: a value that is not a finite number - unset, null, an empty
   input, or a hand-edited settings file - reads as the default; anything else is
   brought inside the range and rounded to an integer, so neither the page nor
   the stylesheet ever sees a fraction of a pixel. A numeric string counts as a
   number, because an <input type="number"> hands its value back as text. */

function chromeSetting (key, defaultValue, min, max) {
  var setting = {
    key: key,
    default: defaultValue,
    min: min,
    max: max,
    clamp: function (value) {
      var numeric = NaN
      if (typeof value === 'number') {
        numeric = value
      } else if (typeof value === 'string' && value.trim() !== '') {
        numeric = Number(value)
      }
      if (!Number.isFinite(numeric)) {
        return setting.default
      }
      return Math.round(Math.min(max, Math.max(min, numeric)))
    }
  }
  return setting
}

var chromeSettings = {
  pageCornerRadius: chromeSetting('pageCornerRadius', 20, 0, 100),
  hoverTolerance: chromeSetting('hoverTolerance', 0, 0, 24)
}

if (typeof module !== 'undefined') {
  module.exports = chromeSettings
}
