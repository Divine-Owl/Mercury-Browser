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
    () => app.windows().find(page => page.url().startsWith('mercury://app/')),
    { what: 'the browser UI window to open', timeout: 45000 }
  )

  // The app opens the address bar on its empty first tab shortly after the UI
  // appears. Waiting for that here settles the one piece of startup state the specs
  // would otherwise race against; it is not an assertion, so a timeout is not a
  // failure - openAddressBar opens the bar itself if it is closed.
  await until(
    async () => !(await ui.evaluate(() => document.getElementById('tab-editor').hidden)),
    { what: 'the address bar to open on the first tab', timeout: 10000 }
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

/* Opens the address bar if it is closed.

   Not with a keystroke. Min routes shortcuts through `before-input-event` in the
   main process (see the comment at the top of js/keybindings.js), and Playwright's
   synthetic key events are delivered straight to the renderer, so the app never
   sees them: Ctrl+T and Ctrl+L do nothing here, which was worth discovering before
   the specs relied on them. A mouse click is an ordinary DOM event and does work.

   On a fresh launch the editor is already open on the empty first tab, so there is
   nothing to click. Afterwards it is hidden behind the page, and clicking the
   focused tab's title reopens it (js/navbar/tabBar.js's click handler calls
   tabEditor.show). Only ever clicked while hidden, because the editor overlays the
   tab strip and would swallow the click. */
async function openAddressBar (ui) {
  const isHidden = () => ui.evaluate(() => document.getElementById('tab-editor').hidden)
  if (!(await isHidden())) return

  try {
    await ui.click('.tab-item.active', { timeout: 5000 })
  } catch (e) {
    // The editor can open between the check above and the click, in which case the
    // click is swallowed by it - which is success, not failure. Re-throw only if it
    // is still closed.
    if (await isHidden()) throw e
    return
  }

  await until(async () => !(await isHidden()), { what: 'the address bar to open', timeout: 15000 })
}

/* Fills the address bar and presses Enter - the app's own submit path, which is
   what calls urlParser.parse and hands the result to the view manager.

   `fill` rather than `keyboard.type`: the editor selects its contents when it
   opens, and Min's focus handling races with a test's first keystrokes, so typed
   text can land inside the previous URL instead of replacing it (observed: the
   second navigation in a session kept the first URL). fill replaces the value in
   one step, and the check below still asserts the text arrived before Enter is
   pressed - a mismatch here means the app, not the test, is in an unexpected
   state. */
async function enterUrl (ui, url) {
  await openAddressBar(ui)
  await ui.fill('#tab-editor-input', url)

  const typed = await ui.inputValue('#tab-editor-input')
  if (typed !== url) {
    throw new Error(`the address bar did not receive the URL (it holds ${JSON.stringify(typed)})`)
  }

  await ui.keyboard.press('Enter')
}

/* Opens a short mercury:// URL the way a user would - through the address bar - and
   waits for a tab to be showing the page it resolves to. */
async function openShortUrl (ui, app, shortUrl, expectedUrl) {
  await enterUrl(ui, shortUrl)
  return until(
    async () => (await webContentsList(app)).find(wc => wc.url === expectedUrl),
    { what: `${shortUrl} to render as ${expectedUrl} in a tab`, timeout: 30000 }
  )
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
  enterUrl,
  openShortUrl,
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
