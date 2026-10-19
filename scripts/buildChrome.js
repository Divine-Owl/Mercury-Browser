const browserify = require('browserify')
const renderify = require('electron-renderify')
const path = require('path')
const fs = require('fs')

const rootDir = path.resolve(__dirname, '../')
const jsDir = path.resolve(__dirname, '../js')

const intermediateOutput = path.resolve(__dirname, '../dist/chrome.build.js')
const outFile = path.resolve(__dirname, '../dist/chrome.js')

/* The chrome page is a window of its own, so it gets a bundle of its own: one
   browserified entry with the compiled locales concatenated in front of it,
   because l() has to exist in the page once the island carries locale labels
   (Task 7 on). Nothing else is shared with dist/bundle.js on purpose - the UI
   page's bundle carries the whole tab strip and every surface that has not
   migrated, and none of that belongs in a 77 px layer. */
const fileList = [
  'dist/localization.build.js',
  'js/chrome/default.js'
]

function buildChrome () {
  // build localization support first, since it is included in the bundle
  require('./buildLocalization.js')()

  /* concatenate legacy modules */
  let output = ''
  fileList.forEach(function (script) {
    output += fs.readFileSync(path.resolve(__dirname, '../', script)) + ';\n'
  })

  fs.writeFileSync(intermediateOutput, output, 'utf-8')

  const instance = browserify(intermediateOutput, {
    paths: [rootDir, jsDir],
    ignoreMissing: false,
    node: true,
    detectGlobals: false
  })

  instance.exclude('chokidar')

  instance.transform(renderify)
  const stream = fs.createWriteStream(outFile, { encoding: 'utf-8' })
  instance.bundle()
    .on('error', function (e) {
      console.warn('\x1b[31m' + 'Error while building: ' + e.message + '\x1b[30m')
    })
    .pipe(stream)
}

if (module.parent) {
  module.exports = buildChrome
} else {
  buildChrome()
}
