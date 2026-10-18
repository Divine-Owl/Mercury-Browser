// Loads a renderer-side module in Node.
//
// Those modules read browser globals at require time — `window`, `ipc`,
// `localStorage` — and they use browserify-style bare specifiers such as
// require('util/searchEngine.js'), which Node cannot resolve unless the
// module's directory is on NODE_PATH. Both have to be in place before the
// first require, which is why this is a helper rather than something each
// test sets up for itself.

const path = require('node:path')
const { ROOT } = require('./repo.js')

const noop = () => {}

global.ipc = { on: noop, send: noop, removeListener: noop }
global.window = {
  globalArgs: {
    'user-data-path': '/tmp/mercury-test',
    'app-version': '0.1.0',
    'app-name': 'Mercury',
    'window-id': '1'
  },
  platformType: 'linux',
  addEventListener: noop,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
}
global.localStorage = global.window.localStorage

// With nodeIntegration, Electron injects Node's builtins into the renderer as
// globals, so renderer modules use a bare `fs` instead of require('fs'):
// js/util/settings/settings.js and js/util/hosts.js both do, and
// js/util/urlParser.js pulls both in. Without this the urlParser test dies on a
// ReferenceError at load and never reaches its assertions.
global.fs = require('node:fs')

// NODE_PATH is process-wide and is read by _initPaths(), so it is set around
// the require and restored afterwards: leaving it set would change how every
// later require in the same test file resolves.
function loadRendererModule (rel) {
  const previous = process.env.NODE_PATH
  process.env.NODE_PATH = path.join(ROOT, 'js')
  require('node:module')._initPaths()
  try {
    return require(path.join(ROOT, rel))
  } finally {
    if (previous === undefined) delete process.env.NODE_PATH
    else process.env.NODE_PATH = previous
    require('node:module')._initPaths()
  }
}

module.exports = { loadRendererModule }
