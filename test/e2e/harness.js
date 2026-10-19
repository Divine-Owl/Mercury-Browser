/*
Shared plumbing for the runtime specs.

Two decisions here are worth the ink, because both are about making the specs
mean something rather than merely pass.

**A hermetic HOME.** The isolation requirement is about what the app does *not*
write, and the honest way to test that is to give the app a home in which the only
process that could touch ~/.config/Min is the app under test. Testing against the
real home would be flaky in the worst direction: Min is installed and often
running on the development machine and rewrites its own mtime continuously, so the
assertion would pass in CI and fail locally, and the tempting fix would be to
weaken it. Instead every launch gets a fresh directory with a pre-seeded
~/.config/Min, and the spec can then assert all three things at once - the
directory still exists, its mtime is unchanged, and its contents are untouched.

**The app is driven the way a user drives it.** The browser UI is browserified, so
its modules (`urlParser`, `webviews`, `tabs`) are not globals and cannot be called
from a test. Reaching into the app's IPC to open a tab would bypass the very code
under test: the `mercury://settings` -> `mercury://app/pages/settings/index.html`
rewrite lives in the UI's urlParser, so a spec that loads the long URL directly
proves nothing about the rename. Typing the short URL into the address bar and
pressing Enter exercises the rewrite, the view manager, the protocol handler and
the page's preload, in that order.
*/

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const { _electron } = require('@playwright/test')

const ROOT = path.join(__dirname, '..', '..')

// The app entry is a build artifact, not a source file (package.json main is
// main.build.js), so an unbuilt checkout fails with Electron's own confusing
// "Cannot find module" instead of saying what to do about it.
const ENTRY = path.join(ROOT, 'main.build.js')

const MIN_SENTINEL = '{"e2e":"this file belongs to the fake Min installation and must not change"}\n'

const SETTINGS_PAGE = 'mercury://app/pages/settings/index.html'
const SHORT_SETTINGS_URL = 'mercury://settings'
const NEWTAB_PAGE = 'mercury://app/pages/newtab/index.html'
const SHORT_NEWTAB_URL = 'mercury://newtab'
const READER_PAGE = 'mercury://app/reader/index.html'

// The UI page and the chrome layer are both served from mercury://app/, so any
// lookup by prefix can pick the wrong one. The layer is a WebContentsView, not a
// BrowserWindow, so `app.windows()` cannot see it - everything about it is read
// from the main process - but the exact URLs keep the two apart at every level.
const UI_URL = 'mercury://app/index.html'
const CHROME_PAGE = 'mercury://app/pages/chrome/index.html'

/* The flags every Electron launch here needs, in one place so the two launch paths
   cannot drift.

   --no-sandbox: GitHub's runners do not have the SUID sandbox helper configured
   (`chrome-sandbox` is neither root-owned nor mode 4755), and Chromium aborts with
   "The SUID sandbox helper binary was found, but is not configured correctly"
   before any app code runs. Playwright's `_electron.launch` adds this itself, which
   is why the version-banner check below - the one place that spawns the binary
   directly - was the only test that failed on CI and passed locally.

   --disable-gpu and --disable-dev-shm-usage: no GPU on a runner, and containers
   have a small /dev/shm.
*/
const CHROMIUM_FLAGS = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function until (check, { timeout = 30000, interval = 200, what = 'condition' } = {}) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await check()
    if (last) return last
    await sleep(interval)
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${what}`)
}

// A throwaway HOME, with a fake Min installation already in it.
function makeHome () {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-e2e-'))
  const config = path.join(home, '.config')
  const minDir = path.join(config, 'Min')
  fs.mkdirSync(minDir, { recursive: true })
  fs.writeFileSync(path.join(minDir, 'settings.json'), MIN_SENTINEL)
  return { home, config, minDir }
}

const stat = dir => {
  try {
    const s = fs.statSync(dir)
    return { exists: true, mtimeMs: s.mtimeMs, mode: s.mode }
  } catch (e) {
    return { exists: false }
  }
}

/* Seeds Mercury's own settings.json before the app starts.

   The network spec needs this, and cannot use `--proxy-server`: js/util/proxy.js
   calls `session.setProxy(proxyConfig)` for every session and again on
   `session-created`, and proxyConfig is `{}` unless the app's own `proxy` setting is
   set. So the command-line switch is replaced by a direct connection as soon as the
   app creates its first session - the traffic never reaches a recorder, and the
   spec would pass while proving nothing. */
function writeAppSettings (home, settings) {
  const dir = path.join(home, '.config', 'Mercury')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings))
}

async function launchApp (options = {}) {
  if (!fs.existsSync(ENTRY)) {
    throw new Error(`${path.relative(ROOT, ENTRY)} is missing - run 'npm run build' before the e2e specs`)
  }

  const { home, config, minDir } = options.home
    ? { home: options.home, config: path.join(options.home, '.config'), minDir: path.join(options.home, '.config', 'Min') }
    : makeHome()

  const args = ['.', ...CHROMIUM_FLAGS]

  // XDG_CONFIG_HOME takes precedence over HOME for app.getPath('appData'), so
  // both have to point into the throwaway home - otherwise the isolation
  // assertion would be quietly watching the wrong directory.
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: config }
  delete env.XDG_DATA_HOME

  const app = await _electron.launch({ args, cwd: ROOT, env, timeout: 60000 })

  const ui = await until(
    () => app.windows().find(page => page.url() === UI_URL),
    { what: 'the browser UI window to open', timeout: 45000 }
  )

  // Startup no longer opens an editor: §4.11 keeps the island retracted on the first
  // tab, and the new tab page is the tour. What settles here is the chrome layer
  // being up, which the specs that read it would otherwise race against; it is not
  // an assertion, so a timeout is not a failure.
  await until(
    async () => inMain(app, ({ webContents }) => webContents.getAllWebContents()
      .some(wc => wc.getURL() === CHROME_PAGE)),
    { what: 'the chrome layer to be up', timeout: 10000 }
  ).catch(() => {})

  const userData = await app.evaluate(({ app }) => app.getPath('userData'))

  return {
    app,
    ui,
    home,
    minDir,
    userData,
    async close () {
      await app.close().catch(() => {})
    }
  }
}

// Runs a function in the main process. Playwright takes a function that receives
// the electron module, which is the only way to reach app/protocol/webContents.
const inMain = (app, fn, arg) => app.evaluate(fn, arg)

const webContentsList = app => inMain(app, ({ webContents }) =>
  webContents.getAllWebContents().map(wc => ({ id: wc.id, url: wc.getURL(), title: wc.getTitle() })))

const findByUrl = (contents, fragment) => contents.filter(wc => wc.url.includes(fragment))

/* The window's own chrome layer, read from the main process.

   The browser window is found structurally - the one whose contentView holds the
   UI page - because BaseWindow.getAllWindows() also holds the app's hidden
   history-service window, so indexing the list is wrong. The layer is the child
   whose URL is the chrome page; the order is returned whole so a spec can assert
   where the layer sits rather than only that it exists. */
const layerFacts = app => inMain(app, ({ BaseWindow }) => {
  const win = BaseWindow.getAllWindows().find(w =>
    (w.contentView ? w.contentView.children : []).some(view =>
      view.webContents && view.webContents.getURL() === 'mercury://app/index.html'))
  if (!win) return { found: false }

  const children = win.getContentView().children
  const bounds = win.getContentBounds()
  const layer = children.find(view =>
    view.webContents && view.webContents.getURL() === 'mercury://app/pages/chrome/index.html')

  return {
    found: true,
    contentWidth: bounds.width,
    contentHeight: bounds.height,
    order: children.map(view => (view.webContents ? view.webContents.getURL() : '(no contents)')),
    layer: layer ? { bounds: layer.getBounds() } : null,
    layerIsLast: !!layer && children[children.length - 1] === layer
  }
})

/* Runs an expression in the chrome page and returns its value. The chrome layer
   is not a Playwright page, so its DOM is read this way. */
const chromeDom = (app, script) => inMain(app, ({ webContents }, script) => {
  const wc = webContents.getAllWebContents().find(w => w.getURL() === 'mercury://app/pages/chrome/index.html')
  if (!wc) throw new Error('the chrome page is not open')
  return wc.executeJavaScript(script)
}, script)

/* Injects input into a webContents through the DevTools protocol.

   Playwright's synthetic keys never reach main's `before-input-event`, and
   `webContents.sendInputEvent` is dropped unless the window is focused, so the
   runtime specs drive the pointer and the keyboard this way: real Chromium input
   events, delivered to whatever the page has focused. Callers must focus the
   window (and the target webContents) first - an unfocused target drops it. */
const cdp = (app, urlFragment, commands) => inMain(app, async ({ webContents }, { urlFragment, commands }) => {
  const wc = webContents.getAllWebContents().find(w => w.getURL().includes(urlFragment))
  if (!wc) throw new Error(`no webContents matching ${urlFragment}`)
  wc.debugger.attach('1.3')
  try {
    for (const command of commands) {
      await wc.debugger.sendCommand(command.method, command.params)
    }
  } finally {
    wc.debugger.detach()
  }
  return true
}, { urlFragment, commands })

/* Drives the browser window from main, for the things only a real window can be
   asked: `win.focus()` / `win.blur()`, and `win.emit(event)` for the events this
   environment cannot produce at all.

   That last case is measured, not assumed: with no window manager behind the test
   display, `win.blur()` leaves `isFocused()` true and fires nothing, so the only
   way to deliver a blur here is to emit it the way main itself would receive it.
   A spec that emits proves the handler is registered and the rule's answer is
   applied; it does not prove that the OS blurs the window. `request` is
   `{ op: 'focus' | 'blur' }` or `{ op: 'emit', event: 'blur' }`.

   The finder is written out here rather than shared with layerFacts because
   Playwright serializes this function to run in the main process, where nothing
   defined out here exists. BaseWindow.getAllWindows() includes the app's hidden
   history-service window, so the browser window is found by its contentView
   holding the UI page, never by index. */
const driveWindow = (app, request) => inMain(app, ({ BaseWindow }, request) => {
  const win = BaseWindow.getAllWindows().find(w =>
    (w.contentView ? w.contentView.children : []).some(view =>
      view.webContents && view.webContents.getURL() === 'mercury://app/index.html'))
  if (!win) throw new Error('the browser window is not open')
  if (request.op === 'emit') {
    win.emit(request.event)
  } else {
    win[request.op]()
  }
  return win.isFocused()
}, request)

/* Focuses the window's webContents for `urlFragment`, so an injection lands.

   The recorded fact is that injected input needs a focused window *and* a focused
   target; a pointer that moves from one page to another moves that focus with it,
   and a case that leaves it to whichever page was injected into last is a case
   that passes or fails with the order the file happens to run in. */
const focusContents = (app, urlFragment) => inMain(app, ({ webContents }, urlFragment) => {
  const wc = webContents.getAllWebContents().find(w => w.getURL().includes(urlFragment))
  if (!wc) throw new Error(`no webContents matching ${urlFragment}`)
  wc.focus()
  return wc.isFocused()
}, urlFragment)

/* Opens a tab, by sending the UI page the very message the application menu's
   New Tab item sends (main/menu.js's `sendIPCToWindow(window, 'addTab')`, which
   delivers `{}`): a native menu cannot be clicked from a test, so the message is
   the honest stand-in - it is exactly what a click on that item delivers, and
   js/menuRenderer.js is the other end of it. */
const newTab = app => inMain(app, ({ webContents }) => {
  const wc = webContents.getAllWebContents().find(w => w.getURL() === 'mercury://app/index.html')
  if (!wc) throw new Error('the UI page is not open')
  wc.send('addTab', {})
  return true
})

/* Samples pixels out of a view's own capture.

   The bitmap is BGRA. What a capture cannot show is transparency: the page's
   transparent areas come back opaque (measured here: white, alpha 255, where
   js/chrome's frame's rounded corner clips the paint away), so a capture is an
   oracle for what the page painted and not for what the window lets through.
   The chrome specs compare pixels against the token colour for that reason.
   No screen-level screenshot is involved: this is the view's compositor output. */
const pixels = (app, urlFragment, points) => inMain(app, async ({ webContents }, { urlFragment, points }) => {
  const wc = webContents.getAllWebContents().find(w => w.getURL().includes(urlFragment))
  if (!wc) throw new Error(`no webContents matching ${urlFragment}`)
  const image = await wc.capturePage()
  const bitmap = image.toBitmap()
  const size = image.getSize()
  return points.map(({ x, y }) => {
    const i = (y * size.width + x) * 4
    return { x, y, b: bitmap[i], g: bitmap[i + 1], r: bitmap[i + 2], a: bitmap[i + 3] }
  })
}, { urlFragment, points })

/* Opens the island, because the address pill is inside it.

   Driven as a user drives it: focus the window, put the pointer on the frame's
   band, and wait for the chrome page to say it is out. CDP for the pointer
   because that is the only injection this machine delivers (see the fact table
   in the M1 plan); Playwright's synthetic keys are not involved here at all.

   Not with a keystroke. Min routes shortcuts through `before-input-event` in the
   main process (see the comment at the top of js/keybindings.js), and Playwright's
   synthetic key events are delivered straight to the renderer, so the app never
   sees them: Ctrl+T and Ctrl+L do nothing here. */
async function openAddressBar (ui, app) {
  /* The page's bundle is what reports the pointer, and it runs after the layer's
     webContents exists - so a move delivered too early is a move nobody hears.
     Waiting for the load settles that, the same way the old helper's wait for the
     editor settled the old one. */
  await until(async () => chromeDom(app, 'document.readyState === "complete"'), {
    what: 'the chrome page to finish loading'
  })

  await driveWindow(app, { op: 'focus' })
  await focusContents(app, 'pages/chrome/')
  await cdp(app, 'pages/chrome/', [
    { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 120, y: 6 }}
  ])
  await until(async () => chromeDom(app, 'document.body.classList.contains("ct-open")'), {
    what: 'the island to open'
  })
}

/* The pill's editing state: open the island, click the pill, and type.

   A click, not a shortcut: the pill is an ordinary DOM control in the chrome
   layer, so the press goes to it as it goes to any other control. `insertText`
   replaces the selection `beginEdit` made, which is why this does not need the
   focus handling `fill` had to worry about in the old editor. Returns nothing:
   the caller presses Enter or Escape. */
async function addressInput (ui, app, text) {
  await openAddressBar(ui, app)

  const at = await chromeDom(app, `(() => {
    const rect = document.getElementById('address-input').getBoundingClientRect()
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
  })()`)

  await driveWindow(app, { op: 'focus' })
  await focusContents(app, 'pages/chrome/')
  await cdp(app, 'pages/chrome/', [
    { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 }},
    { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }}
  ])

  await until(async () => chromeDom(app, '!document.getElementById("address-input").readOnly'), {
    what: 'the pill to begin editing'
  })
  await cdp(app, 'pages/chrome/', [{ method: 'Input.insertText', params: { text: text }}])

  const typed = await chromeDom(app, 'document.getElementById("address-input").value')
  if (typed !== text) {
    throw new Error(`the address pill did not receive ${JSON.stringify(text)} (it holds ${JSON.stringify(typed)})`)
  }
}

/* A key, as the app's own key handling sees one. The `char` event is what a
   renderer's text input looks for, and the code/key pair is what the app's
   handlers match on - neither is optional on this machine. */
const pressKey = (app, key, code, keyCode) => cdp(app, 'pages/chrome/', [
  { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: key, code: code, windowsVirtualKeyCode: keyCode, text: key === 'Enter' ? '\r' : undefined }},
  ...(key === 'Enter' ? [{ method: 'Input.dispatchKeyEvent', params: { type: 'char', key: key, code: code, windowsVirtualKeyCode: keyCode, text: '\r' }}] : []),
  { method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: key, code: code, windowsVirtualKeyCode: keyCode }}
])

const pressEnter = app => pressKey(app, 'Enter', 'Enter', 13)
const pressEscape = app => pressKey(app, 'Escape', 'Escape', 27)

/* Fills the island's address pill and presses Enter - the app's own submit path,
   which is what parses the value and hands it to the view manager. */
async function enterUrl (ui, app, url) {
  await addressInput(ui, app, url)
  await pressEnter(app)
}

/* Opens a short mercury:// URL the way a user would - through the address bar - and
   waits for a tab to be showing the page it resolves to.

   "Showing" includes having a title. Electron's `webContents.getTitle()` is a
   main-process cache that lags the document's own title: on this machine the page
   read `readyState === 'complete'` with `document.title` already set while
   `getTitle()` still returned the URL, for up to a second when the machine was
   loaded. Specs assert on that cached title, so the wait continues until the cache
   catches up. A page that genuinely has no <title> keeps the URL as its title and
   is returned after the grace period rather than hanging here - the caller's own
   assertion is the right place to notice that. */
async function openShortUrl (ui, app, shortUrl, expectedUrl) {
  await enterUrl(ui, app, shortUrl)
  const tab = await until(
    async () => (await webContentsList(app)).find(wc => wc.url === expectedUrl),
    { what: `${shortUrl} to render as ${expectedUrl} in a tab`, timeout: 30000 }
  )

  if (tab.title === tab.url) {
    await until(
      async () => {
        const wc = (await webContentsList(app)).find(w => w.id === tab.id)
        return wc && wc.title !== wc.url ? wc.title : null
      },
      { what: `${expectedUrl} to publish its title`, timeout: 5000 }
    ).then(title => { tab.title = title }).catch(() => {})
  }

  return tab
}

const openSettingsTab = (ui, app) => openShortUrl(ui, app, SHORT_SETTINGS_URL, SETTINGS_PAGE)
const openNewTabPage = (ui, app) => openShortUrl(ui, app, SHORT_NEWTAB_URL, NEWTAB_PAGE)

/* Keeps the settings spec independent of ordering: a test that needs the page
   asks for it and gets the already-open tab if another test opened one. */
async function ensureSettingsPage ({ ui, app }) {
  const open = (await webContentsList(app)).find(wc => wc.url === SETTINGS_PAGE)
  return open || openSettingsTab(ui, app)
}

/* Everything the specs want to know about the settings page, read from the main
   process. `executeJavaScript` runs in the page itself, which is what makes these
   observable facts about what a user would see rather than assertions about the
   absence of errors - the failure being guarded against (a preload whose origin
   guard still says min://) renders a blank page and throws nothing at all. */
const settingsPageFacts = app => inMain(app, async ({ webContents }) => {
  const wc = webContents.getAllWebContents().find(w => w.getURL().includes('/pages/settings/'))
  if (!wc) return { found: false }
  return {
    found: true,
    url: wc.getURL(),
    title: wc.getTitle(),
    heading: await wc.executeJavaScript('(document.querySelector("h1,h2") || {}).textContent || ""'),
    headingCount: await wc.executeJavaScript('document.querySelectorAll("h1,h2").length'),
    textLength: await wc.executeJavaScript('document.body.innerText.length'),
    textSample: await wc.executeJavaScript('document.body.innerText.slice(0, 120)'),
    settingsBridge: await wc.executeJavaScript('typeof window.settings'),
    checkboxPresent: await wc.executeJavaScript('!!document.getElementById("checkbox-show-divider")'),
    checkboxChecked: await wc.executeJavaScript('(document.getElementById("checkbox-show-divider") || {}).checked')
  }
})

/* The reader view, read the way the settings page is. It is the mercury:// page
   whose chrome is a build artifact rather than static HTML: reader/index.html
   loads dist/localization.build.js, which fills the elements carrying
   [data-string] and [data-label] as it loads. A non-empty label is therefore
   evidence that the generated bundle was served over the scheme - and that the
   scheme served it to a page which was itself loaded through the scheme. */
const readerPageFacts = (app, url) => inMain(app, async ({ webContents }, wanted) => {
  const wc = webContents.getAllWebContents().find(w => w.getURL() === wanted)
  if (!wc) return { found: false }
  return {
    found: true,
    url: wc.getURL(),
    crashed: wc.isCrashed(),
    hasBackLink: await wc.executeJavaScript('!!document.getElementById("backtoarticle")'),
    backLinkText: await wc.executeJavaScript('((document.querySelector("#backtoarticle-link span") || {}).textContent || "").trim()'),
    settingsLabel: await wc.executeJavaScript('(function () { var b = document.getElementById("settings-button"); return b ? (b.getAttribute("aria-label") || "") : "" })()'),
    text: await wc.executeJavaScript('document.body.innerText'),
    // The article body is rendered into a sandboxed same-origin iframe
    // (reader/reader.js sets rframe.srcdoc), so `.reader-main` is in that frame's
    // document, not the page's. allow-same-origin is what lets this read it.
    frameText: await wc.executeJavaScript('(function () { var f = document.querySelector(".reader-frame"); var d = f && f.contentDocument; return d && d.body ? d.body.innerText.trim() : "" })()'),
    framePresent: await wc.executeJavaScript('!!document.querySelector(".reader-frame")')
  }
}, url)

/* Clicks the "divider between tabs" checkbox through the page's own change
   listener. The value only reaches disk if the whole chain survives: the page's
   listener, settingsContent's postMessage, settingsPreload's origin guard, and the
   main process's ipc handler. */
const clickShowDividerCheckbox = app => inMain(app, async ({ webContents }) => {
  const wc = webContents.getAllWebContents().find(w => w.getURL().includes('/pages/settings/'))
  if (!wc) throw new Error('the settings page is not open')
  return wc.executeJavaScript(`
    (() => {
      const cb = document.getElementById('checkbox-show-divider')
      if (!cb) return 'no checkbox'
      cb.checked = !cb.checked
      cb.dispatchEvent(new Event('change', { bubbles: true }))
      return 'now ' + cb.checked
    })()
  `)
})

const readSettingsFile = userData => {
  const file = path.join(userData, 'settings.json')
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
}

const electronPath = () => require('electron')

// `electron . -v` prints the version banner and exits, per main/main.js.
function versionBanner () {
  return new Promise((resolve, reject) => {
    execFile(electronPath(), ['.', '-v', ...CHROMIUM_FLAGS], { cwd: ROOT, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`${error.message}\n${stderr}`))
      resolve(stdout.trim())
    })
  })
}

module.exports = {
  ROOT,
  ENTRY,
  SETTINGS_PAGE,
  SHORT_SETTINGS_URL,
  NEWTAB_PAGE,
  SHORT_NEWTAB_URL,
  READER_PAGE,
  MIN_SENTINEL,
  sleep,
  until,
  stat,
  makeHome,
  writeAppSettings,
  launchApp,
  inMain,
  webContentsList,
  findByUrl,
  layerFacts,
  chromeDom,
  cdp,
  pixels,
  driveWindow,
  focusContents,
  newTab,
  UI_URL,
  CHROME_PAGE,
  enterUrl,
  openShortUrl,
  addressInput,
  openAddressBar,
  pressEnter,
  pressEscape,
  openSettingsTab,
  openNewTabPage,
  ensureSettingsPage,
  settingsPageFacts,
  readerPageFacts,
  clickShowDividerCheckbox,
  readSettingsFile,
  versionBanner,
  electronPath
}
