# Mercury Identity & Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an imported Min v1.35.7 tree into an installable Linux application named Mercury that never touches Min's data, data directory, or infrastructure, and can run alongside Min.

**Architecture:** A rebrand-and-sever exercise on a single import commit. Identity is driven from `package.json` (`productName`, `desktopName`) plus a shared Linux identity module for the packaging scripts. Min's infrastructure is removed rather than gated, so the privacy property is structural and greppable. Tests are Node script assertions over the source tree (`node --test`), plus a packaged-artifact check and a Playwright/xvfb runtime check; the source is never the only evidence.

**Tech Stack:** Electron 43.4.1 (bundled), electron-builder 26.17.0, browserify 16, Node 22, `node --test`, `decomment`, Playwright (Electron driver only), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-18-mercury-identity-foundation-design.md`

## Global Constraints

- Display name **Mercury**; npm package and binary **`mercury-browser`**; URL scheme **`mercury://`**; desktop ID **`org.mercury.Browser`**; version starts at **`0.1.0`**.
- Upstream baseline is **Min v1.35.7**; tarball sha256 must equal `93b4a2fcd715669ea15672d46d8e7f7f1e52bba485fa68c1f0dca8852a4561ed`.
- Telemetry is removed entirely: no upload code, no `collectUsageStats` setting, no settings-page toggle.
- **No functional reference to any `minbrowser.*` host** may remain. Comment references to upstream issue URLs (`github.com/minbrowser/min/issues/NNN`) are accurate history and are **preserved verbatim** — every such check strips comments first.
- The whole word `Min` never appears in a locale **value**. Locale **keys are frozen** — no key may be added, removed or renamed.
- Page translation is removed in v0.1.
- Electron is bundled. `electron-builder` is **at least 26.17.0** — `desktopName` support depends on it.
- Licence stays Apache-2.0; `LICENSE.txt` is unmodified; a `NOTICE` is added.
- Tests run on **Node 22** via `node --test`. `npm test` remains Min's `standard` linter and must pass after every task.
- **Local dependency state is self-contained.** `node_modules/` is project-local by default; `.npmrc` puts npm's cache in `.cache/npm` (a relative path npm resolves against this directory — verified), and `scripts/devEnv.sh` puts Electron's, electron-builder's and node-gyp's caches in `.cache/` too. Deleting the checkout leaves nothing in `$HOME`. There is no Python virtualenv: this is a Node project, and node-gyp installs no Python packages, so a venv would isolate nothing.
- **Local builds:** `source scripts/devEnv.sh` before any `npm install` or `npm run build`.
- **Packaging is CI-only.** This host is CachyOS/Arch with no `dpkg-deb`, `rpmbuild` or `fpm`, and about 1.3 GB RAM available, so it can build the app bundle but not the `.deb`/`.rpm`/AppImage, nor read a `.deb` back. Tasks 10–12 run on GitHub Actions (public repo, free minutes).

## Review Focus

Five failure modes the spec implies but that no single task's tests would otherwise catch. Each is pinned to a test in the task that owns the code.

1. **`mercury:settings` typed into the URL bar must open the settings page, not a search.** Measured today: `urlParser.parse('mercury:settings')` returns `https://duckduckgo.com/?q=mercury%3Asettings&t=min`. A partial rename silently degrades a typed internal URL into a web search. Test: `test/urlParser.test.js` (Task 6).
2. **`mercury://settings` must render and round-trip a value.** A stale `min://` origin guard in a preload renders a blank page with no error and no exception. Test: `test/e2e/launch.spec.js` (Task 12).
3. **Locales where `Min` is not whitespace-delimited must still be replaced** — Japanese writes `Minは`, `Minの`. A whitespace-based replacement skips every one of them. Test: `test/localization.test.js` (Task 7).
4. **Locale keys that merely contain the letters `Min` must not change** — `timeRangeMinutes`, `appMenuMinimize`. Test: key-set equality against a fixture (Task 7).
5. **Mercury must not read, write or lock an existing `~/.config/Min`.** Test: runtime isolation check (Task 12); `strace`/`stat` procedure remains in the spec §6 for manual confirmation.

---

### Task 1: Import the Min v1.35.7 baseline

**Files:**
- Create: the entire upstream tree at the repository root (257 tracked paths)
- Preserve: `docs/` (the spec) — upstream has no `docs/` at the root
- Preserve: `.gitignore`, `.npmrc` — upstream ships both, so the import overwrites them; Step 3 restores the committed versions
- Preserve: `scripts/devEnv.sh` — no upstream file shares its name, so it needs no restoring

**Interfaces:**
- Produces: an unmodified Min v1.35.7 tree that every later task edits.

- [ ] **Step 1: Fetch and verify the tarball**

```bash
mkdir -p /tmp/opencode/min-import && cd /tmp/opencode/min-import
curl -fsSL -o min-1.35.7.tar.gz https://github.com/minbrowser/min/archive/v1.35.7.tar.gz
sha256sum min-1.35.7.tar.gz
```
Expected: `93b4a2fcd715669ea15672d46d8e7f7f1e52bba485fa68c1f0dca8852a4561ed`. If it differs, **stop** — the baseline is not what the spec describes.

- [ ] **Step 2: Extract over the repository root**

```bash
tar -xzf min-1.35.7.tar.gz
cp -a min-1.35.7/. /home/ahmadprames/Documents/AI/Mercury-Browser/
```

`cp -a` does not remove `docs/`, and the tarball contains no `node_modules`, `dist/` or `main.build.js` (all gitignored anyway).

- [ ] **Step 3: Restore the repository's own `.gitignore` and `.npmrc`**

**Upstream ships both files, so `cp -a` has just overwritten them.** The committed versions are the correct ones: they carry upstream's entries plus this checkout's local cache settings, which keep npm's cache and node-gyp's headers inside the checkout. Restore them:

```bash
cd /home/ahmadprames/Documents/AI/Mercury-Browser
git checkout HEAD -- .gitignore .npmrc
grep -q 'cache=./.cache/npm' .npmrc && echo "ok: local cache settings intact"
grep -q 'node-linker=hoisted' .npmrc && echo "ok: upstream setting retained"
grep -q '/node_modules' .gitignore && echo "ok: upstream ignore retained"
```

`scripts/devEnv.sh` needs no restoring — no upstream file shares its name.

- [ ] **Step 4: Verify the import**

```bash
cd /home/ahmadprames/Documents/AI/Mercury-Browser
node -p "require('./package.json').version"     # 1.35.7
node -p "require('./package.json').name"        # min
git status --porcelain | grep -c '^??'          # ~257 new paths
git check-ignore -v node_modules 2>/dev/null || true
```
Expected: version `1.35.7`, name `min`, and no `node_modules`/`dist` in the add set.

- [ ] **Step 5: Add the read-only upstream remote**

```bash
git remote add upstream https://github.com/minbrowser/min
git remote -v
```
`upstream` is for `git fetch` and `git diff` only. It is never merged and never pushed to.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: import Min v1.35.7 baseline

Unmodified upstream tree.
Source: https://github.com/minbrowser/min/archive/v1.35.7.tar.gz
sha256: 93b4a2fcd715669ea15672d46d8e7f7f1e52bba485fa68c1f0dca8852a4561ed
Licence: Apache-2.0"
```

---

### Task 2: Test harness and package identity

**Files:**
- Create: `test/helpers/repo.js`, `test/helpers/renderer.js`, `test/identity.test.js`
- Modify: `package.json`, `main/main.js`, `.nvmrc`

**Interfaces:**
- Produces: `test/helpers/repo.js` exporting
  - `ROOT: string` — absolute repository root
  - `readFile(rel: string): string`
  - `sourceFiles(): string[]` — absolute paths of every `.js`, `.html`, `.css` under `js/`, `main/`, `pages/`, `reader/` plus the root `index.html`, excluding `node_modules`, `dist`, `localization/languages`, and `ext/`
  - `stripComments(text: string, ext: string): string` — `decomment` for `.js`, `/* */` and `<!-- -->` removal for `.css`/`.html`
- Produces: `test/helpers/renderer.js` exporting `loadRendererModule(rel: string): any` — installs the `window`, `ipc` and `localStorage` globals the renderer modules read at load time, sets `NODE_PATH` to `<ROOT>/js` so browserify-style bare specifiers like `util/searchEngine.js` resolve, restores both on exit.
- Produces: npm script `test:unit` = `node --test test/`

- [ ] **Step 1: Write the failing test**

`test/identity.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./helpers/repo.js')

test('package.json carries the Mercury identity', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'mercury-browser')
  assert.equal(pkg.productName, 'Mercury')
  assert.equal(pkg.desktopName, 'org.mercury.Browser')
  assert.equal(pkg.version, '0.1.0')
})
```

- [ ] **Step 2: Write the helpers**

`test/helpers/repo.js` — implement the four exports above. `sourceFiles()` recurses with a fixed prefix list; `stripComments` caches nothing and is called per assertion.

`test/helpers/renderer.js`:

```js
const noop = () => {}
global.ipc = { on: noop, send: noop, removeListener: noop }
global.window = {
  globalArgs: { 'user-data-path': '/tmp/mercury-test', 'app-version': '0.1.0', 'app-name': 'Mercury', 'window-id': '1' },
  platformType: 'linux',
  addEventListener: noop,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
}
global.localStorage = global.window.localStorage
```

then `loadRendererModule` sets `process.env.NODE_PATH = path.join(ROOT, 'js')`, calls `require('node:module')._initPaths()`, requires the absolute path, and restores `NODE_PATH` in a `finally`.

- [ ] **Step 3: Install dependencies into the checkout**

```bash
source scripts/devEnv.sh
npm install --omit=optional
```

Then confirm nothing escaped into `$HOME`:

```bash
du -sh .cache/* node_modules
ls ~/.cache/electron 2>/dev/null && echo "LEAKED to \$HOME" || echo "ok: no ~/.cache/electron"
```

`--omit=optional` matches Min's own CI. This is the first heavy local step: expect roughly 1–1.5 GB in `node_modules` and a few hundred MB more in `.cache/`. Available RAM on this machine is about 1.3 GB, which is enough for `npm install` and `npm run build` but **not** for electron-builder — that is why packaging stays in CI (Tasks 10–12).

If `~/.cache/electron` appears, `ELECTRON_CACHE` was not picked up: re-source `scripts/devEnv.sh` in the same shell that runs `npm install`.

- [ ] **Step 4: Add the script and run the test — it must fail**

Add to `package.json` `scripts`: `"test:unit": "node --test test/"`.

Run: `npm run test:unit`
Expected: FAIL — `name` is `'min'`, and `productName`/`desktopName` are `'Min'`/absent.

- [ ] **Step 5: Set the identity in `package.json`**

```json
{
  "name": "mercury-browser",
  "productName": "Mercury",
  "desktopName": "org.mercury.Browser",
  "version": "0.1.0",
  "description": "Mercury is a fast, minimal browser that protects your privacy.",
  "author": "Mercury Developers"
}
```
Leave `main`, `license`, `electronVersion`, `repository`, `dependencies` and `devDependencies` (except the electron-builder bump in Task 9) alone.

- [ ] **Step 6: Rebrand the version banner**

In `main/main.js`, the `-v`/`--version` branch prints `'Min: ' + app.getVersion()`. Change the literal to `'Mercury: '`. Leave the adjacent `'Chromium: '` line unchanged.

- [ ] **Step 7: Pin the toolchain**

Write `.nvmrc` containing `22`. `node --test` requires Node ≥ 18; the current `.nvmrc` says `15.7.0`, which cannot run the test runner, and Min's own CI already uses Node 25. The system Node here is 26.11.1, which runs the tests unchanged — `.nvmrc` pins CI and any nvm user, not this machine.

- [ ] **Step 8: Run the tests — they must pass**

Run: `npm run test:unit`
Expected: PASS — 1 test, 1 pass.

Run: `npm test`
Expected: PASS — the `standard` linter is clean. It lints `js/**/*.js` and `main/*.js`, so the `main/main.js` edit is covered.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: set Mercury identity and add node --test harness"
```

---

### Task 3: Remove telemetry

**Files:**
- Delete: `js/statistics.js`
- Modify: `js/browserUI.js`, `js/default.js`, `js/newTabPage.js`, `js/pageTranslations.js`, `js/passwordManager/passwordManager.js`, `js/sessionRestore.js`, `js/userscripts.js`, `pages/settings/index.html`, `pages/settings/settings.js`
- Create: `test/no-telemetry.test.js`

**Interfaces:**
- Consumes: `test/helpers/repo.js` — `ROOT`, `readFile`, `sourceFiles`, `stripComments`
- Produces: nothing other tasks import.

The module is deleted rather than neutered: eight modules call `statistics.incrementValue`/`registerGetter` purely to build the upload payload, so leaving the counters in place would leave dead state accumulating forever. The blocked-request count shown in settings does **not** come from here — `pages/settings/settings.js` reads `#content-blocking-blocked-requests` — so removing this module does not affect it.

- [ ] **Step 1: Write the failing test**

`test/no-telemetry.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, readFile, sourceFiles, stripComments } = require('./helpers/repo.js')

test('the statistics module is gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'js/statistics.js')), false)
})

test('no source references telemetry', () => {
  for (const file of sourceFiles()) {
    const ext = path.extname(file)
    const code = stripComments(readFile(path.relative(ROOT, file)), ext)
    assert.doesNotMatch(code, /services\.minbrowser\.org/, file)
    assert.doesNotMatch(code, /collectUsageStats/, file)
  }
})

test('the usage-statistics toggle is removed from settings', () => {
  const html = readFile('pages/settings/index.html')
  assert.doesNotMatch(html, /checkbox-usage-statistics/)
  assert.doesNotMatch(readFile('pages/settings/settings.js'), /usageStatisticsCheckbox/)
})
```

- [ ] **Step 2: Run it — it must fail**

Run: `npm run test:unit`
Expected: FAIL on the first assertion.

- [ ] **Step 3: Delete the module and its call sites**

Run `grep -rn "statistics" js/ main/ pages/` and remove, for each hit:
- the `require('js/statistics.js')` / `require('statistics.js')` line,
- every `statistics.incrementValue(...)` and `statistics.registerGetter(...)` call, including the function passed as the second argument,
- `require('statistics.js').initialize()` in `js/default.js`.

Then `git rm js/statistics.js`.

- [ ] **Step 4: Remove the setting and its UI**

- `pages/settings/index.html`: delete the `setting-section` `<div>` containing `<input type="checkbox" id="checkbox-usage-statistics">` and its `<label>`.
- `pages/settings/settings.js`: delete the `/* usage statistics setting */` block — the `getElementById('checkbox-usage-statistics')` lookup, the `settings.get('collectUsageStats', ...)` listener and the `change` handler.

Locale keys (including `settingsUsageStatisticsToggle`) are **frozen**: leave them. An unused localised string is harmless; removing it would break the key-set test in Task 7 and churn 35 files for nothing.

- [ ] **Step 5: Run the tests — they must pass**

Run: `npm run test:unit`
Expected: PASS.

Run: `npm test`
Expected: PASS. `standard` fails on unused variables, so it catches any local left behind by the removals.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove usage statistics collection, setting and toggle"
```

---

### Task 4: Sever the remaining Min endpoints

**Files:**
- Delete: `js/searchbar/updateNotifications.js`
- Modify: `js/sessionRestore.js`, `main/main.js`, `js/webviewMenu.js`, `js/navbar/contentBlockingToggle.js`, `pages/settings/index.html`
- Create: `test/no-min-infrastructure.test.js`

**Interfaces:**
- Consumes: `test/helpers/repo.js`
- Produces: `test/no-min-infrastructure.test.js`, extended by Task 5.

Scanned source **excludes `pages/translateService/`** in this task: that directory is removed in Task 5, and excluding it keeps this task's test meaningful on its own.

- [ ] **Step 1: Write the failing test**

```js
const EXCLUDED = ['pages/translateService/']

test('no functional reference to a Min host remains', () => {
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file)
    if (EXCLUDED.some(prefix => rel.startsWith(prefix))) continue
    const code = stripComments(readFile(rel), path.extname(rel))
    assert.doesNotMatch(code, /minbrowser\.(org|github\.io)/, rel)
  }
})

test('the update feed is gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'js/searchbar/updateNotifications.js')), false)
})

test('no source schedules an update check', () => {
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file)
    const code = stripComments(readFile(rel), path.extname(rel))
    assert.doesNotMatch(code, /updateNotifications/, rel)
  }
})
```

- [ ] **Step 2: Run it — it must fail**

Run: `npm run test:unit`
Expected: FAIL — `js/searchbar/updateNotifications.js` still exists and `js/sessionRestore.js` still names `minbrowser.github.io`.

- [ ] **Step 3: Delete the update feed**

`git rm js/searchbar/updateNotifications.js`, then `grep -rn "updateNotifications" js/ main/` and remove the `require` and the plugin registration from `js/default.js`. Update checking is removed, not gated: Min's check defaults to *enabled* (`settings.get('updateNotificationsEnabled') !== false`), so leaving the module in place would require an inverted default to be safe.

- [ ] **Step 4: Remove the first-run tour and the dead survey**

In `js/sessionRestore.js`:
- delete the `try { // first run, show the tour ... }` branch that adds a tab at `https://minbrowser.github.io/min/tour`, so first run falls through to opening a new tab,
- delete the `/* Disabled - show a user survey on startup ... */` and `/* Disabled - show user survey ... */` comment blocks — including the `fetch('https://minbrowser.org/survey/survey15.json')` inside them. Both are already commented out, so this is dead-code removal, not behaviour change.

- [ ] **Step 5: Repoint the crash reporter**

In `main/main.js`, `crashReporter.start({ submitURL: ..., uploadToServer: false, compress: true })` — change `submitURL` to `'https://github.com/Divine-Owl/Mercury-Browser'`. `uploadToServer: false` means nothing is uploaded today; this is housekeeping, not a leak fix.

- [ ] **Step 6: Repoint the Help menu and support links**

In `main/main.js` the Help menu opens four Min URLs. Replace: keyboard-shortcuts wiki → drop the item (no wiki exists); new-issue → `https://github.com/Divine-Owl/Mercury-Browser/issues/new`; tour → drop the item; project site → `https://github.com/Divine-Owl/Mercury-Browser`.

In `js/webviewMenu.js` ("report a translation problem") and `js/navbar/contentBlockingToggle.js` ("report a content-blocking problem"), repoint `github.com/minbrowser/min/issues/new...` to `github.com/Divine-Owl/Mercury-Browser/issues/new...`, preserving the query-string title and body.

In `pages/settings/index.html`, repoint the `minbrowser/min/wiki/Content-blocking-settings` `href` to `https://github.com/Divine-Owl/Mercury-Browser#readme` (no wiki exists yet).

Leave every remaining `github.com/minbrowser/min/issues/NNN` occurrence alone — all of those are comments citing upstream history, and Step 7 proves it.

- [ ] **Step 7: Run the tests — they must pass**

Run: `npm run test:unit`
Expected: PASS — every remaining `minbrowser` occurrence is inside a comment.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: remove update feed, first-run tour and dead survey; repoint support links"
```

---

### Task 5: Remove page translation

**Files:**
- Delete: `pages/translateService/` (whole directory)
- Modify: `js/webviewMenu.js`, `main/main.js`, `package.json`, `test/no-min-infrastructure.test.js`

**Interfaces:**
- Consumes: `test/no-min-infrastructure.test.js` from Task 4
- Produces: a tightened `no-min-infrastructure` test with no exclusions.

Translation downloads Bergamot models from `services.minbrowser.org` and is reachable from the page context menu with no setting gate, so it is the last live, user-initiated path to Min's servers. Mercury hosts no model registry, so the feature is withdrawn in v0.1 (spec §7).

- [ ] **Step 1: Tighten the test**

In `test/no-min-infrastructure.test.js`, set `const EXCLUDED = []` and add:

```js
test('the translation service is gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'pages/translateService')), false)
})
```

- [ ] **Step 2: Run it — it must fail**

Run: `npm run test:unit`
Expected: FAIL on `pages/translateService/translateService.js` naming `services.minbrowser.org`.

- [ ] **Step 3: Remove the feature**

- `git rm -r pages/translateService`
- In `js/webviewMenu.js`, remove the context-menu entry labelled `l('translatePage')` (and its `click`/`visible` handler).
- In `main/main.js`, remove the `translatePage` and `translatePreload` constants and the branch that creates and loads `translateWindow`.
- Run `grep -rn "pageTranslations\|translateWindow\|translatePreload\|bergamot" js/ main/ pages/` and delete whatever is left serving only translation — including `js/pageTranslations.js` if nothing else requires it.
- Remove `@browsermt/bergamot-translator` from `package.json` `dependencies`.

Locale keys (`translatePage` and friends) stay: keys are frozen.

- [ ] **Step 4: Run the tests — they must pass**

Run: `npm run test:unit`
Expected: PASS. Then `npm test` — PASS. `standard` will flag anything the deletions orphaned.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove page translation, the last live dependency on Min infrastructure"
```

---

### Task 6: Rename the `min://` scheme to `mercury://`

**Files:**
- Modify: `js/navbar/tabBar.js`, `js/navbar/tabEditor.js`, `js/pdfViewer.js`, `js/places/tagIndex.js`, `js/preload/default.js`, `js/readerView.js`, `js/searchbar/customBangs.js`, `js/sessionRestore.js`, `js/util/settings/settingsPreload.js`, `js/util/urlParser.js`, `js/webviews.js`, `main/main.js`
- Rename: `main/minInternalProtocol.js` → `main/mercuryInternalProtocol.js`
- Create: `test/scheme.test.js`, `test/urlParser.test.js`

**Interfaces:**
- Consumes: `test/helpers/repo.js`, `test/helpers/renderer.js` (`loadRendererModule`)
- Produces: nothing later tasks import.

The test pattern is deliberately `(['"\`])min:(\/\/)?[a-zA-Z0-9]` — a bare `min:` pattern would false-positive on object keys such as `{ min: 0 }`, and requiring a quote aligns with how every real site is written.

- [ ] **Step 1: Write the failing tests**

`test/scheme.test.js`:

```js
const SCHEME_SITE = /(['"`])min:(\/\/)?[a-zA-Z0-9]/

test('no source still uses the min: scheme', () => {
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file)
    const code = stripComments(readFile(rel), path.extname(rel))
    assert.doesNotMatch(code, SCHEME_SITE, rel)
  }
})

test('the internal protocol module registers mercury', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'main/minInternalProtocol.js')), false)
  const src = readFile('main/mercuryInternalProtocol.js')
  assert.match(src, /registerSchemesAsPrivileged/)
  assert.match(src, /scheme:\s*'mercury'/)
  assert.match(src, /protocol\.handle\('mercury'/)
})
```

`test/urlParser.test.js` — this pins Review Focus #1:

```js
const urlParser = loadRendererModule('js/util/urlParser.js')

test('a typed shortened internal URL resolves to the internal page, not a search', () => {
  assert.equal(urlParser.parse('mercury:settings'), 'mercury://app/pages/settings/index.html')
  assert.equal(urlParser.parse('mercury://settings'), 'mercury://app/pages/settings/index.html')
  assert.equal(urlParser.parse('mercury:newtab'), 'mercury://app/pages/newtab/index.html')
})

test('internal URL detection', () => {
  assert.equal(urlParser.isInternalURL('mercury://app/index.html'), true)
  assert.equal(urlParser.isInternalURL('https://example.com'), false)
})

test('viewer URLs map back to the page they display', () => {
  assert.equal(
    urlParser.getSourceURL('mercury://app/pages/reader/index.html?url=https%3A%2F%2Fexample.com'),
    'https://example.com'
  )
})
```

- [ ] **Step 2: Run them — they must fail**

Run: `npm run test:unit`
Expected: FAIL. `parse('mercury:settings')` currently returns `https://duckduckgo.com/?q=mercury%3Asettings&t=min` — a search, not the settings page.

- [ ] **Step 3: Rename the scheme**

Mechanical, across the twelve files listed above plus the protocol module:
- `min://` → `mercury://`
- `'min:'` → `'mercury:'` (the shortened form; `js/util/urlParser.js` normalises it)
- the normaliser regex `/min:(\/\/)?/g` → `/mercury:(\/\/)?/g`
- `git mv main/minInternalProtocol.js main/mercuryInternalProtocol.js`, then `scheme: 'min'` → `'mercury'` and `protocol.handle('min', ...)` → `protocol.handle('mercury', ...)`, and update the `require` of that module in `main/main.js`

Two sites are easy to miss and both are load-bearing:
- `Access-Control-Allow-Origin: 'min://app'` in `main/main.js` — a response header, not a URL.
- The two preload guards, `js/preload/default.js` and `js/util/settings/settingsPreload.js`, which compare `e.origin`/`window.location` against the scheme. See Review Focus #2.

- [ ] **Step 4: Run the tests — they must pass**

Run: `npm run test:unit`
Expected: PASS. Then `npm test` — PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rename the min:// scheme to mercury://"
```

---

### Task 7: Rebrand the localisation strings

**Files:**
- Create: `test/helpers/locales.js`, `test/fixtures/localization-keys.json`, `test/localization.test.js`
- Modify: all 35 files in `localization/languages/`

**Interfaces:**
- Consumes: `test/helpers/repo.js`
- Produces: `test/helpers/locales.js` exporting
  - `localeFiles(): string[]` — absolute paths, sorted
  - `parseLocale(absPath): { name: string, identifier: string, translations: object }` — strips comments with `decomment` before `JSON.parse`
  - `localeKeySets(): Record<string, string[]>` — identifier → sorted flattened key paths, nested objects dot-joined (`settingsBlockedRequestCount.unsafeHTML`)

The locale files are **JSONC**: they contain `/* */` and `//` comments, so a bare `JSON.parse` rejects valid files. `decomment` is already a dependency and is what the upstream build uses.

- [ ] **Step 1: Write the locale helper**

`test/helpers/locales.js`, implementing the three exports above.

- [ ] **Step 2: Record the key fixture from the pristine tree**

Before any locale edit, write every locale's flattened key list to `test/fixtures/localization-keys.json`:

```bash
node -e "require('fs').writeFileSync('test/fixtures/localization-keys.json', JSON.stringify(require('./test/helpers/locales.js').localeKeySets(), null, 1))"
git add test/fixtures/localization-keys.json
```
Commit this fixture **before** the rename, so it is a record of the pre-change state and cannot be regenerated to match a mistake.

- [ ] **Step 3: Write the failing test**

`test/localization.test.js`:

```js
test('every locale file parses', () => {
  for (const file of localeFiles()) assert.doesNotThrow(() => parseLocale(file), file)
})

test('no locale key was added, removed or renamed', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/localization-keys.json'), 'utf8'))
  assert.deepEqual(localeKeySets(), expected)
})

test('no locale value contains the whole word Min', () => {
  for (const file of localeFiles()) {
    const { identifier, translations } = parseLocale(file)
    assert.doesNotMatch(JSON.stringify(translations), /\bMin\b/, identifier)
  }
})

test('the product name is substituted in a non-Latin locale', () => {
  const ja = parseLocale(localeFiles().find(f => f.endsWith('/ja.json')))
  assert.match(ja.translations.serverNotFoundSubtitle, /Mercury/)
})
```

`\b` here is ASCII-only, which is exactly what makes it correct: `Minは` and `Minの` have a boundary after `Min`, while `timeRangeMinutes` and `appMenuMinimize` do not — those are keys, and the key test above would catch their corruption anyway.

- [ ] **Step 4: Run it — it must fail**

Run: `npm run test:unit`
Expected: FAIL on the "whole word Min" test, and on the `ja` substitution test.

- [ ] **Step 5: Replace the whole word**

Replace every regex match of `\bMin\b` with `Mercury` across the 35 files in `localization/languages/`. en-US itself hardcodes the word in nine places (`serverNotFoundSubtitle`, `sslErrorMessage`, `genericConnectionFail`, `sslTimeErrorMessage`, `multipleInstancesErrorMessage`, the `settingsBlockedRequestCount` `unsafeHTML`, `settingsStartupOptions`, `updateNotificationTitle`, `passwordManagerSetupSignIn`), so this is a literal swap, not a placeholder substitution.

Do **not** touch `%n`: it is substituted at the call site — `l('appMenuQuit').replace('%n', app.name)` — so the 205 `%n` sites already follow the product name and need no edit.

- [ ] **Step 6: Run the tests — they must pass**

Run: `npm run test:unit`
Expected: PASS — all four locale tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: rebrand the product name across all 35 locales"
```

The built-bundle check (`grep -o -w Min dist/localization.build.js` → `0`) runs in CI in Task 11, because it needs `npm run build`.

---

### Task 8: Rebrand the remaining identity strings

**Files:**
- Modify: `index.html`, `js/browserUI.js`, `pages/places/placesService.html`, `pages/settings/settings.js`, `main/main.js`, `main/registryConfig.js`, `js/util/searchEngine.js`, `js/searchbar/bangsPlugin.js`, `js/searchbar/instantAnswerPlugin.js`
- Create: `test/identity-strings.test.js`

**Interfaces:**
- Consumes: `test/helpers/repo.js`
- Produces: nothing later tasks import.

Localisation covers translated strings but not these: the window title, HTML document titles, the Windows default-browser registration, and the DuckDuckGo attribution tag.

- [ ] **Step 1: Write the failing test**

```js
test('no source still contains the whole word Min', () => {
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file)
    const code = stripComments(readFile(rel), path.extname(rel))
    assert.doesNotMatch(code, /\bMin\b/, rel)
  }
})

test('the search-engine attribution tag is not min', () => {
  for (const rel of ['js/util/searchEngine.js', 'js/searchbar/bangsPlugin.js', 'js/searchbar/instantAnswerPlugin.js']) {
    assert.doesNotMatch(readFile(rel), /[?&]t=min\b/, rel)
  }
})
```

- [ ] **Step 2: Run it — it must fail**

Run: `npm run test:unit`
Expected: FAIL, naming `index.html`.

- [ ] **Step 3: Rebrand each site**

- `index.html` — `<title>Min</title>` → `<title>Mercury</title>`
- `js/browserUI.js` — the window-title suffix array's `'Min'` → `'Mercury'`
- `pages/places/placesService.html` — `<title>Min history service</title>` → `Mercury history service`
- `pages/settings/settings.js` — `document.title = l('settingsPreferencesHeading') + ' | Min'` → `' | Mercury'`
- `main/main.js` — the About dialog's `'Min v' + app.getVersion()` → `'Mercury v'`
- `main/registryConfig.js` — every Windows registry key and value: `HKCU\Software\Classes\Min` → `...\Mercury`, `Software\Clients\StartMenuInternet\Min` → `...\Mercury`, the `Min Browser Document` ProgID description, and the `Min` key/value names. Inert on Linux, but this is the Windows default-browser identity and it is cheapest to change now, while there are no users to migrate.
- `js/util/searchEngine.js` (both `t=min`), `js/searchbar/bangsPlugin.js`, `js/searchbar/instantAnswerPlugin.js` — `t=min` → `t=mercury`. This is the attribution tag DuckDuckGo receives; leaving it would have Mercury identify itself to a third party as Min.

- [ ] **Step 4: Run the tests — they must pass**

Run: `npm run test:unit`
Expected: PASS. Then `npm test` — PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rebrand window titles, HTML titles, registry identity and search tag"
```

---

### Task 9: Packaging identity

**Files:**
- Create: `scripts/linuxIdentity.js`, `icons/icon256.png`, `icons/icon256.ico`
- Modify: `package.json`, `scripts/createPackage.js`, `scripts/buildDebian.js`, `scripts/buildAppImage.js`, `scripts/buildRedhat.js`, `resources/postinst_script`, `resources/prerm_script`

**Interfaces:**
- Produces: `scripts/linuxIdentity.js` — a CommonJS module exporting the shared Linux packaging options:
  `{ executableName: 'mercury-browser', syncDesktopName: true, icon: 'icons/icon256.png', category: 'Network;WebBrowser', mimeTypes: ['x-scheme-handler/http', 'x-scheme-handler/https', 'x-scheme-handler/mercury', 'text/html'], maintainer: 'Mercury Developers', description: '...', synopsis: '...' }`
- Consumed by `scripts/createPackage.js`, `buildDebian.js`, `buildAppImage.js`, `buildRedhat.js`, each spreading it into its `options.linux`.

One module rather than four copies: `desktopName` support requires **both** the `package.json` field and `linux.syncDesktopName`, and a desync in any one script produces a correct build with broken window association — a failure that only shows up at runtime in someone's desktop session.

- [ ] **Step 1: Bump electron-builder**

`package.json` `devDependencies`: `"electron-builder": "^24.13.3"` → `"^26.17.0"`. Version 26.17.0 is the first stable release whose `LinuxTargetHelper.getDesktopFileName()` reads `package.json` `desktopName` when `linux.syncDesktopName` is set; 24.13.3 has no `desktopName` support at all. This is a two-major bump — if it surfaces unrelated breakage, stop and report rather than pinning back.

- [ ] **Step 2: Write the shared identity module**

`scripts/linuxIdentity.js` as specified in Interfaces. `description` and `synopsis` are **rewritten, not renamed** — Min's copy advertises DuckDuckGo instant answers and Min's feature set.

- [ ] **Step 3: Fix the fuse-flip path**

`scripts/createPackage.js`'s `afterPack` recomputes the executable name as `appInfo.productFilename.toLowerCase().replace('-dev', '')` — that is `mercury`, which will not match a binary named `mercury-browser`. Use the configured name instead, with the old expression as fallback:

```js
const executableName = context.packager.executableName ||
  context.packager.appInfo.productFilename.toLowerCase().replace('-dev', '')
```

- [ ] **Step 4: Spread the shared options**

In each of `createPackage.js`, `buildDebian.js`, `buildAppImage.js` and `buildRedhat.js`, replace the hard-coded `linux` options with `{ ...require('./linuxIdentity.js'), target: [...] }`, keeping each script's own `target`.

- [ ] **Step 5: Rename the artifacts and metadata**

- `buildDebian.js`: `artifactName: 'mercury-browser-${version}-${arch}.deb'`, `packageName: 'mercury-browser'`, and the shared `maintainer`/`description`/`synopsis`. The `depends` list stays — it is a real dependency set.
- `buildAppImage.js`: same identity fields; its synopsis and description currently describe Min.
- `buildRedhat.js`: same treatment (check it for its own copies of these strings).

- [ ] **Step 6: Rebrand the maintainer scripts**

In `resources/postinst_script` and `resources/prerm_script`, replace `/opt/Min/min` → `/opt/Mercury/mercury-browser`, `min.desktop` → `org.mercury.Browser.desktop`, `/usr/bin/min` → `/usr/bin/mercury-browser`, and the `x-www-browser` alternative target path.

- [ ] **Step 7: Replace the icons**

Replace `icons/icon256.png` and `icons/icon256.ico` with Mercury artwork. **Placeholder art is acceptable for v0.1** — a flat rounded-square mark is enough for packaging to work and for Task 12's window-association check to be meaningful. Record "final artwork pending" as a follow-up; do not treat the placeholder as final.

- [ ] **Step 8: Verify nothing builds locally**

Do not run `npm run buildDebian` here — packaging runs in CI (Task 11). Confirm the edits are internally consistent by reading each script's `options` object.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: packaging identity, bundled electron-builder 26, maintainer scripts and icons"
```

---

### Task 10: Packaged-artifact verification

**Files:**
- Create: `scripts/verifyPackage.js`
- Modify: `package.json` (add `verifyPackage` script)

**Interfaces:**
- Consumes: nothing from earlier tasks beyond the artifacts Task 9 produces.
- Produces: npm script `verifyPackage` = `node scripts/verifyPackage.js`, non-zero exit on failure. Task 11 runs it.

This is the only check that can catch a silently wrong `desktopName` wiring, because the failure mode is a correct-looking build whose windows are never associated with their launcher entry.

- [ ] **Step 1: Write the verifier**

`scripts/verifyPackage.js` takes the first `.deb` matching `dist/app/mercury-browser-*.deb` and extracts it **with `ar` and `tar`, not `dpkg-deb`** — a `.deb` is an `ar` archive holding `control.tar.*` and `data.tar.*`, and `ar`/`tar` are present on this host while `dpkg-deb` is not (CachyOS/Arch). It then asserts:

- the artifact filename matches `mercury-browser-<version>-<arch>.deb`
- `<tmp>/usr/share/applications/org.mercury.Browser.desktop` exists — **the exact basename is the point**
- that file contains `StartupWMClass=org.mercury.Browser`
- that file contains `Name=Mercury`
- that file's `Exec=` names `mercury-browser`
- `<tmp>/opt/Mercury/mercury-browser` exists and is executable
- the desktop file declares `MimeType=` including `x-scheme-handler/mercury`

On success print each assertion and exit 0; on failure print the assertion, the observed value and exit 1.

The extraction is `ar x` then `tar -xf` — **no compression flags**. Verified against a real `.deb` on this host (`ar t` lists `debian-binary`, `control.tar.gz`, `data.tar.gz`) and against GNU tar 1.35, which auto-detects gzip, xz and zstd on extract. That matters because the container's compression is electron-builder's choice, not ours, and fpm commonly emits `data.tar.xz` while the sample here was `.tar.gz`. Also note the control archive's members are named `control` and `md5sums` — **not** `./control`; the `./`-prefixed form fails.

- [ ] **Step 2: Document the local limitation**

Requires `ar` and `tar` — both verified present here. It still runs in CI (Ubuntu, which has `dpkg-deb` as well) rather than locally: this host is CachyOS/Arch with no `dpkg-deb`, `rpmbuild` or `fpm`, so it can neither build the package nor read it back with the vendor tooling. The script exits with a clear message rather than a stack trace if `ar` is missing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: verify packaged desktop file, app id and executable name"
```

---

### Task 11: CI — lint, unit tests, build and package

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `.github/workflows/build-packages.yml`

**Interfaces:**
- Consumes: `test:unit` (Task 2), `verifyPackage` (Task 10)
- Produces: the build and test path every later sub-project reuses.

- [ ] **Step 1: Write the CI workflow**

`.github/workflows/ci.yml`, triggered on `push` to `main`, `pull_request`, and `workflow_dispatch`:

- job `test` on `ubuntu-latest`, Node 22: `npm install --omit=optional`, `npm test` (the `standard` linter), `npm run test:unit`
- job `package` on `ubuntu-latest`, Node 22, `needs: test`: `npm install --omit=optional`, `npm run build`, then the spec §6 built-output assertions, then `npm run buildDebian`, then `npm run verifyPackage`

The built-output assertions in the `package` job, per spec §6:

```bash
grep -o -w "Min" dist/localization.build.js | wc -l    # expect 0
node -e "const d=require('decomment'),fs=require('fs');for(const f of fs.readdirSync('localization/languages')){JSON.parse(d(fs.readFileSync('localization/languages/'+f,'utf8')))};console.log('all locales parse')"
```

Because `.npmrc` redirects npm's cache into the workspace, it now holds `${{ github.workspace }}/.cache/npm` on the runner too. That is harmless, and worth caching with `actions/cache` keyed on `hashFiles('package.json')` — the alternative is re-downloading the whole dependency tree on every run. Add it to the `package` job's cache and key it on `package.json`.

- [ ] **Step 2: Update the upstream packaging workflow**

`build-packages.yml` is `workflow_dispatch`-only and builds Windows, macOS and Linux. Trim it to what Mercury v0.1 ships (deb, rpm, AppImage) and let `ci.yml` own the push/PR path. Do not delete the macOS/Windows matrix outright — mark it as the platform-later path so it is not rebuilt from scratch.

- [ ] **Step 3: Confirm the quota assumption**

The repository is public (`Divine-Owl/Mercury-Browser`), so Actions minutes are free. If the repository is ever made private, this workflow stops at the free quota — that is an expected stop, not a transient failure, and it is not a reason to fall back to local builds without asking.

- [ ] **Step 4: Push and watch a run**

```bash
git push -u origin main
```
Then dispatch or observe the workflow and confirm both jobs pass. **This is the first end-to-end proof that the identity wiring produces a correct package.**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "ci: lint, unit tests, build and package verification"
```

---

### Task 12: Runtime verification

**Files:**
- Create: `test/e2e/launch.spec.js`, `test/e2e/network.spec.js`, `test/e2e/proxy.js`
- Modify: `package.json` (add `playwright` devDependency, `test:e2e` script), `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the built bundle from `npm run build`
- Produces: npm script `test:e2e` = `playwright test test/e2e`, and a CI job step running it under `xvfb-run`.

- [ ] **Step 1: Add Playwright for the Electron driver only**

`npm install -D playwright` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. Only `_electron.launch()` is used, so no browser binaries are downloaded — this is why `playwright` rather than a full browser install.

- [ ] **Step 2: Write the launch spec**

`test/e2e/launch.spec.js` launches the app with `_electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env } })` and asserts:

- the first window's `document.title` contains `Mercury`
- `mercury://settings` renders: navigate there and assert a settings heading is present and non-empty — **this is Review Focus #2.** A stale `min://` guard in `settingsPreload.js` produces a blank page with no thrown error, so asserting on visible text, not on absence of errors, is the only reliable check.
- a boolean setting round-trips: read a setting's initial value, toggle it through the page, and assert the change is persisted — proving the preload's `postMessage`/`ipc` bridge is intact after the scheme rename
- `--version` output is `Mercury: <version>` (launch with `-v` and read stdout)
- **data-directory isolation (SC2):** the running app's `app.getPath('userData')` ends with `.config/Mercury`, and `~/.config/Min` does not exist afterwards, or its modification time is unchanged if it already did — **this is Review Focus #5.** Run the spec's `stat -c %y ~/.config/Min` before and after to confirm the mtime is untouched, not merely that the directory still exists.
- no singleton lock is taken under `~/.config/Min` — assert no `SingletonLock`/`Singleton*` file appears there while the app runs, which is what makes running alongside a real Min installation safe

Also assert the scheme reached the process command line:

```js
const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
assert.match(cmdline, /--standard-schemes=mercury/)
```

- [ ] **Step 3: Write the network spec**

`test/e2e/proxy.js` is a minimal HTTP proxy that logs the host of every `CONNECT` and every absolute-URI request line, and refuses connections. `test/e2e/network.spec.js` launches the app with `--proxy-server=127.0.0.1:<port>`, waits 60 seconds with a window open, then asserts **no logged host matches `/minbrowser/`**.

This is Review Focus #5's sibling and the runtime half of SC1: the static tests prove the code is gone, and this proves nothing else reaches Min. The first-run tour would have hit `minbrowser.github.io` here; nothing should.

- [ ] **Step 4: Run under xvfb**

Add `test:e2e` to `ci.yml`, run as `xvfb-run -a npm run test:e2e` after the build step. Verify the job passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: runtime verification of mercury:// rendering and network isolation"
```

---

### Task 13: Licensing, attribution and the upstream hedge

**Files:**
- Create: `NOTICE`, `docs/upstream-hedge.md`
- Modify: `README.md`
- Preserve: `LICENSE.txt` — **unmodified**

**Interfaces:**
- Consumes: nothing. Produces the provenance record the repo ships with.

- [ ] **Step 1: Confirm the licence file is untouched**

```bash
git diff db616c9 -- LICENSE.txt    # db616c9 is the spec commit
```
Expected: no output. Min is Apache-2.0 and Mercury keeps it.

- [ ] **Step 2: Add the NOTICE**

State: Mercury is a modified fork of Min (`https://github.com/minbrowser/min`) v1.35.7; the fork date (2026-10-18); that the upstream licence is Apache-2.0; that no warranty is provided; and a summary of the modifications — rebranded identity, removed usage statistics, removed update feed, removed first-run tour, removed page translation, removed the survey, renamed the internal URL scheme, rebranded localisation strings.

Note in the file that Apache-2.0 §4(b) asks for prominent notices on **modified files**, and that Mercury currently satisfies this via the NOTICE plus git history rather than a per-file header. Flag the strict per-file reading as an open compliance question rather than asserting it is settled.

- [ ] **Step 3: Rewrite the README**

Replace Min's README entirely: what Mercury is, that it is a fork of Min v1.35.7 under Apache-2.0, that it collects **no** usage statistics, how to build (`npm install && npm run build`), how to package (`npm run buildDebian` / `buildAppImage` / `buildRedhat`), how to run the tests (`npm test`, `npm run test:unit`, `npm run test:e2e`), the attribution to Min, and a pointer to `docs/superpowers/specs/` for design decisions. Remove Min's donation, download and community links.

- [ ] **Step 4: Write the hedge procedure**

`docs/upstream-hedge.md` records spec §4.6 as an executable routine: watch upstream releases; for each, fetch `https://github.com/minbrowser/min/compare/v1.35.7...v1.35.8.diff`; review for security-relevant changes; `git apply` those selectively; never merge `upstream`. State the **monthly** cadence explicitly and note why it must be deliberate: a fresh repository has no upstream history, so no one will notice an upstream fix by looking at this repo.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: NOTICE, rewritten README and upstream hedge procedure"
```

---

## Done when

Every item in the spec's success criteria holds:

- `npm run test:unit` passes — including the isolation, scheme and localisation tests.
- The `package` CI job builds a `.deb` and `verifyPackage` confirms `org.mercury.Browser.desktop`, `StartupWMClass=org.mercury.Browser`, and a `mercury-browser` executable.
- The `e2e` CI job confirms `mercury://settings` renders, the version banner reads `Mercury`, `--standard-schemes=mercury` is on the command line, and no request reaches a `minbrowser.*` host.
- Manually, on your desktop: `~/.config/Mercury` is created while `~/.config/Min` is untouched, Min and Mercury run at the same time without a singleton collision, and the task switcher groups the Mercury window under `org.mercury.Browser` with the Mercury icon.
