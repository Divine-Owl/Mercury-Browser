/*
Runtime verification: does the identity work survive contact with a running app?

Every static test in this sub-project asserts on source. These assert on a real
Electron process and on the DOM a user would see, which is the only way to catch
the failures that look like success:

  - a preload whose origin guard still says min:// renders a blank settings page
    and throws nothing, so the spec asserts on visible text, not on quiet errors;
  - a `mercury://` scheme that is not registered as standard/secure still serves
    pages, it just loses the privileges the app's internals depend on;
  - an app that writes to Min's profile instead of its own works perfectly and
    corrupts the other installation's data.

The scheme spec deliberately does *not* look for `--standard-schemes=mercury` on
the main process's own command line. That was the plan's assertion and it cannot
hold: the switch is appended by `registerSchemesAsPrivileged` after the process has
started, so it is absent from the main process's /proc entry and present only in
the child processes Chromium spawns, which inherit it. The assertion is kept, moved
to where it is true, and backed by the in-process and in-renderer facts that
actually decide whether the rename worked.
*/

const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')
const pkg = require('../../package.json')

const {
  MIN_SENTINEL,
  SETTINGS_PAGE,
  SHORT_SETTINGS_URL,
  NEWTAB_PAGE,
  launchApp,
  until,
  stat,
  makeHome,
  writeAppSettings,
  inMain,
  webContentsList,
  ensureSettingsPage,
  openNewTabPage,
  settingsPageFacts,
  clickShowDividerCheckbox,
  readSettingsFile,
  versionBanner
} = require('./harness.js')

test.describe('a running Mercury', () => {
  let ctx

  test.beforeAll(async () => {
    // A seeded setting, so the settings page has a value it can only obtain
    // through the preload's origin guard. Static text renders without any of that,
    // which is why the render test below asserts on the value.
    const { home } = makeHome()
    writeAppSettings(home, { showDividerBetweenTabs: true })
    ctx = await launchApp({ home })
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('the window presents itself as Mercury, not Min', async () => {
    expect(ctx.ui.url()).toBe('mercury://app/index.html')
    await expect(ctx.ui).toHaveTitle(/Mercury/)
    const title = await ctx.ui.title()
    expect(title).not.toMatch(/\bMin\b/)
  })

  test('mercury://settings renders instead of a blank page', async () => {
    const tab = await ensureSettingsPage(ctx)

    // The rewrite is the rename: the short form was typed, the long form loaded.
    expect(tab.url).toBe(SETTINGS_PAGE)
    expect(tab.title).toMatch(/Mercury/)

    const facts = await settingsPageFacts(ctx.app)
    expect(facts.found).toBe(true)

    // Visible text, not merely "no exception was thrown". A preload guarded on
    // min:// produces an empty body with a clean console.
    expect(facts.textLength).toBeGreaterThan(200)
    expect(facts.headingCount).toBeGreaterThan(0)
    expect(facts.heading.trim().length).toBeGreaterThan(0)
    expect(facts.textSample).toMatch(/Preferences/)

    // and the page's own bridge is there to talk to
    expect(facts.settingsBridge).toBe('object')
    expect(facts.checkboxPresent).toBe(true)

    // The check that actually covers Review Focus #2. The page's static labels are
    // in its HTML and render whatever the preload does, so visible text alone
    // cannot tell a working preload from a dead one - it took a mutation of the
    // origin guard back to min:// to show that. A setting *value*, though, can only
    // arrive through the guard: the page asks for it over postMessage and only gets
    // an answer if the preload accepts mercury://. So this is seeded as true before
    // launch and must be true on screen.
    expect(facts.checkboxChecked).toBe(true)
  })

  test('a setting round-trips from the page to disk and back', async () => {
    await ensureSettingsPage(ctx)

    const before = readSettingsFile(ctx.userData)
    const initial = before.showDividerBetweenTabs

    const clicked = await clickShowDividerCheckbox(ctx.app)
    expect(clicked).toMatch(/^now (true|false)$/)

    const expected = !initial
    await until(() => readSettingsFile(ctx.userData).showDividerBetweenTabs === expected, {
      what: 'the changed setting to be written to settings.json'
    })
    expect(readSettingsFile(ctx.userData).showDividerBetweenTabs).toBe(expected)

    // and back, so the spec leaves the value where it found it
    await clickShowDividerCheckbox(ctx.app)
    await until(() => readSettingsFile(ctx.userData).showDividerBetweenTabs === Boolean(initial), {
      what: 'the setting to be restored'
    })
  })

  test('mercury://newtab resolves to the new tab page', async () => {
    // Spec SC5 asks for both short URLs. There is deliberately no content
    // assertion here: pages/newtab/index.html is an empty `<body>` shell, in
    // upstream Min too (verified against the installed 1.35.7 copy), so "has
    // visible text" would be false for the right reason. What the rename is
    // answerable for is that the short form resolves and the view loads.
    const tab = await openNewTabPage(ctx.ui, ctx.app)
    expect(tab.url).toBe(NEWTAB_PAGE)

    const healthy = await inMain(ctx.app, async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find(w => w.getURL() === 'mercury://app/pages/newtab/index.html')
      return wc ? { crashed: wc.isCrashed(), loading: wc.isLoading() } : null
    })
    expect(healthy).not.toBeNull()
    expect(healthy.crashed).toBe(false)
  })

  test('mercury:// is registered as a standard, secure scheme', async () => {
    // What the registration is actually for: scheme privileges, and a handler in
    // every session the app uses - the UI runs in the default session, tabs run
    // in persist:webcontent, and main/mercuryInternalProtocol.js registers both.
    const switches = await inMain(ctx.app, ({ app }) => ({
      standard: app.commandLine.getSwitchValue('standard-schemes'),
      secure: app.commandLine.getSwitchValue('secure-schemes'),
      fetch: app.commandLine.getSwitchValue('fetch-schemes')
    }))
    expect(switches.standard).toBe('mercury')
    // Electron only adds standard/secure/fetch switches for the privileges that
    // were requested, so this is the registration talking, not a coincidence.
    expect(switches.secure).toBe('mercury')

    const handled = await inMain(ctx.app, ({ protocol, session }) => ({
      default: protocol.isProtocolHandled('mercury'),
      tabs: session.fromPartition('persist:webcontent').protocol.isProtocolHandled('mercury')
    }))
    expect(handled.default).toBe(true)
    expect(handled.tabs).toBe(true)

    // The renderer's own view of it: a standard scheme gives a real origin, and
    // `secure: true` is what makes isSecureContext true.
    const inRenderer = await ctx.ui.evaluate(() => ({
      origin: location.origin,
      protocol: location.protocol,
      secureContext: window.isSecureContext
    }))
    expect(inRenderer.origin).toBe('mercury://app')
    expect(inRenderer.protocol).toBe('mercury:')
    expect(inRenderer.secureContext).toBe(true)

    // The plan's original assertion, where it is true: child processes inherit the
    // appended switch on their command line. Read from the app's own pid list
    // rather than by pattern-matching /proc for a process name.
    const childPids = await inMain(ctx.app, ({ webContents }) =>
      webContents.getAllWebContents().map(wc => wc.getOSProcessId()).filter(pid => pid > 0))
    expect(childPids.length).toBeGreaterThan(0)
    const cmdlines = childPids
      .filter(pid => fs.existsSync(`/proc/${pid}/cmdline`))
      .map(pid => fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' '))
    expect(cmdlines.length).toBeGreaterThan(0)
    expect(cmdlines.some(cmd => cmd.includes('--standard-schemes=mercury'))).toBe(true)
  })
})

test('the version banner reports Mercury, not Min', async () => {
  const banner = await versionBanner()
  const [first, second] = banner.split('\n')
  expect(first).toBe(`Mercury: ${pkg.version}`)
  expect(first).not.toMatch(/\bMin\b/)
  expect(second).toMatch(/^Chromium: /)
})

test('the app keeps its state in ~/.config/Mercury and never touches ~/.config/Min', async () => {
  // The pre-seeded ~/.config/Min is what makes this exact rather than a guess: the
  // app is about to run in a home where the only thing that could write there is
  // the app under test. The mtime is read before the app starts, so a write during
  // startup cannot slip past.
  const { home } = makeHome()
  const minDir = path.join(home, '.config', 'Min')
  const minSettings = path.join(minDir, 'settings.json')
  const mtimeBeforeRun = stat(minDir).mtimeMs

  const ctx = await launchApp({ home })

  try {
    // The app's own idea of where it lives.
    expect(ctx.userData).toBe(path.join(home, '.config', 'Mercury'))

    const contents = await webContentsList(ctx.app)
    expect(contents.length).toBeGreaterThan(0)

    // The single-instance lock went with it. This is the concrete reason running
    // alongside a real Min is safe: the lock is what a second instance collides
    // with, and Min's copy of it is untouched.
    const ownLocks = fs.readdirSync(ctx.userData).filter(name => name.startsWith('Singleton'))
    expect(ownLocks).toContain('SingletonLock')

    // Min's directory: same mtime, same contents, no locks - while the app runs.
    expect(fs.readdirSync(minDir).filter(name => name.startsWith('Singleton'))).toEqual([])
    expect(fs.readFileSync(minSettings, 'utf8')).toBe(MIN_SENTINEL)
    expect(stat(minDir).mtimeMs).toBe(mtimeBeforeRun)

    // and after it exits, so a write during shutdown cannot slip past.
    await ctx.close()
    expect(fs.readFileSync(minSettings, 'utf8')).toBe(MIN_SENTINEL)
    expect(stat(minDir).mtimeMs).toBe(mtimeBeforeRun)
    expect(fs.readdirSync(minDir).filter(name => name.startsWith('Singleton'))).toEqual([])
  } finally {
    await ctx.close()
  }
})
