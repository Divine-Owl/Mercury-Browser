const chokidar = require('chokidar')
const path = require('path')

const mainDir = path.resolve(__dirname, '../main')
const jsDir = path.resolve(__dirname, '../js')
const preloadDir = path.resolve(__dirname, '../js/preload')
const chromeDir = path.resolve(__dirname, '../js/chrome')
const browserStylesDir = path.resolve(__dirname, '../css')

const buildMain = require('./buildMain.js')
const buildBrowser = require('./buildBrowser.js')
const buildPreload = require('./buildPreload.js')
const buildChrome = require('./buildChrome.js')
const buildBrowserStyles = require('./buildBrowserStyles.js')

chokidar.watch(mainDir).on('change', function () {
  console.log('rebuilding main')
  buildMain()
})

// js/chrome is its own bundle (scripts/buildChrome.js), so the UI bundle's
// watcher ignores it: rebuilding dist/bundle.js on every chrome edit would be
// work whose output nobody reads.
chokidar.watch(jsDir, { ignored: [preloadDir, chromeDir] }).on('change', function () {
  console.log('rebuilding browser')
  buildBrowser()
})

chokidar.watch(preloadDir).on('change', function () {
  console.log('rebuilding preload script')
  buildPreload()
})

chokidar.watch(chromeDir).on('change', function () {
  console.log('rebuilding chrome')
  buildChrome()
})

chokidar.watch(browserStylesDir).on('change', function () {
  console.log('rebuilding browser styles')
  buildBrowserStyles()
})
