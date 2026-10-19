# Mercury UI System — M1 (Chrome Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top band of the UI page with a chrome of Mercury's own — a frameless, transparent window whose chrome is a 12-pixel frame drawn by its own layer above the page, holding real tab pills, a working address pill, navigation and window controls in a floating island, with the page's viewport starting exactly at the frame's bottom edge.

**Architecture:** A new `WebContentsView` (the **chrome layer**) is stacked above the tab views and below nothing. It is a second page of ours (`pages/chrome/`), built by its own browserify bundle, positioned by main (`{x: 0, y: 0, width: w, height: chromeBoxH}`) and driven by main's messages. Main owns the reveal state and the geometry; the UI page (`index.html`) stays the owner of tab state and remains the destination for every command, so there is still exactly one place where a tab is switched or a URL is parsed. The frame, the strip and the island are one page; the pills element is re-parented between the frame and the island, because the strip *is* the island's first row (§4.4). The page's own top corners are painted by a preload module, not by an overlay, so nothing covers the page and no input is redirected (§4.7).

**Tech Stack:** Electron 43.4.1, `BaseWindow` + `WebContentsView`, browserify 16 (the UI bundle and now the chrome bundle), Node 22, `node --test`, Playwright over the existing `test/e2e/harness.js`, `standard` via the existing baseline gate.

**Spec:** `docs/superpowers/specs/2026-10-19-mercury-ui-system-design.md`. This plan implements **M1 only** (§5's first row). M2, M3 and M4 get their own plans when their turn comes; the milestone boundary is restated in Global Constraints so the implementer knows what *not* to build.

---

## What the whole of M1 proves

The exit criteria this plan must demonstrate (SC numbers from §2.3):

- **SC3** — the tab view's viewport begins exactly at the frame's bottom edge.
- **SC4** — with the chrome retracted, the page below the frame receives pointer input unchanged.
- **SC1 (window half)** — the window's top corners carry the frame's 12 px radius over transparency; **(page half)** — the page's top corners follow `pageCornerRadius` 0–100 live.
- **SC9 (radius, tolerance)** — `pageCornerRadius` and `hoverTolerance` apply live.
- **SC11** — SP0's suite stays green.

Not in M1, deliberately: strip scrolling/drag/keep-in-view and the overview (M2); the morph, suggestions, notifications, Ctrl+Tab cards, Ctrl+T, Escape semantics, corridor and grace (M3); the new tab page, themes, motion (M4). §4 is written as the finished design; M1 builds the frame it stands on.

## Deviations from the spec this plan asks the maintainer to accept

1. **The legacy chrome is covered, not deleted, in M1.** §4.14 says the navbar/searchbar markup is "removed from the UI page", and that is where this ends up — but in **M3**, not M1. Removing the markup in M1 would break the boot of ~15 modules that anchor to it (`js/searchbar/*`, `js/navbar/tabBar.js`, `js/navbar/tabEditor.js`, `js/browserUI.js`, `js/menuRenderer.js`, `js/sessionRestore.js`, `js/userscripts.js`, `js/taskOverlay/*`), every one of which M3 rewrites anyway to live inside the island. M1 instead makes the old chrome **unreachable**: the tab views start at the frame's bottom, so the whole old band is covered by the page, and every path that could still summon the old editor is rebound to the chrome layer's address pill (Task 8). No commit is left without a URL editor (R9).
2. **Double-click on the frame to maximise cannot be implemented by us.** Measured in the spike (§1.4): drag regions deliver hover but **swallow presses**, so the chrome page never sees a click on the frame, and a no-drag frame would stop dragging the window. On platforms where the window manager gives a drag region native caption behaviour the gesture works; on Linux/Wayland it is not delivered to us. M1 therefore ships the reliable path only — the island's maximise/restore button — and leaves the gesture to be decided (double-click on a *pill* is deliverable but was explicitly excluded by §4.2). **Flagged for the maintainer.**
3. **The island is a lifted surface (maintainer's call, 2026-10-19).** As first built, `--island-bg` equalled `--frame-bg` — in the dark variant both true black — so an open island had no edge of its own and the chrome read as one black band. The layering spike was recovered from the session store and re-run (§1.4's rig A, its `smoke-open` capture), and its island was a **surface**: a step off the frame, a hairline border, a deep shadow, a capsule's ends, 6 px below the frame. The token table now does that — `--island-bg` a step off `--frame-bg` (dark: `#23252b`), a new `--island-border`, a deeper `--island-shadow`, `islandGap` **6**, `--island-radius` the **capsule rule** (`calc(var(--island-h) / 2)`) — and the box keeps the spike's 8 px of room under the island so its own edge cannot cut the shadow into a hard line. Two numbers move with it: `boxHeight('open')` is **79**, not 77, and `boxHeight('cards')` **66**, not 64. **The island's reveal/retract motion lands with this** (§4.12's timings, the spike's `scale(.98, .6)` drop from the frame's edge) rather than in M4: it is the island's own transition, not the morph or suggestions motion M4 owns. §4.8 and §4.12 carry the amendment; the tasks after this one read the new numbers.

---

## Global Constraints

- **Electron 43.4.1**, pinned in `package.json`. Do not upgrade it in this plan.
- **Four build inputs, one rule each.** `main.build.js` is a *concatenation* (`scripts/buildMain.js` — new main modules go in its list); the UI page is browserify (`scripts/buildBrowser.js` — it follows `require`s, nothing to register); the tab preload is a concatenation (`scripts/buildPreload.js` — new preload modules go in its list); the chrome page gets a new browserify entry `scripts/buildChrome.js`, added to the `build` script chain in `package.json` and to `scripts/watch.js`. Shared modules that both a concatenated bundle and a browserify bundle need carry the `typeof module` guard (precedent: `js/util/theme.js`).
- **Lint gate:** `npm run test:lint` compares per-file error counts to `test/fixtures/lint-baseline.json` and fails when a file's count *grows*. New files are therefore held at 0: write `standard`-clean JavaScript — 2-space indent, no semicolons, single quotes, `var` in UI/main files where the neighbours use it. Main and preload files are concatenated, so a neighbour's `var` is a global at run time but undefined to `standard`: a new file names what it uses in a `/* global … */` comment (`js/places/*` is the precedent) or declares it locally with `require`. Copying an existing main file's bare `ipc`/`windows` is exactly what its baseline errors are — do not.
- **Locale keys are frozen.** `test/localization.test.js` asserts every locale's key set against `test/fixtures/localization-keys.json`. Never remove or rename a key (`settingsSeparateTitlebarToggle` stays in the locales, unused). New strings are added to `localization/languages/en-US.json` **only** — `l()` falls back to en-US for every other language — and the fixture is regenerated in the same commit with:
  `node -e "const {localeKeySets}=require('./test/helpers/locales.js');require('fs').writeFileSync('test/fixtures/localization-keys.json', JSON.stringify(localeKeySets(),null,2)+'\n')"`
- **Unit tests are pure and DOM-free** (`node --test "test/*.test.js"`): geometry, clamps, validation — the spec's §7 list.
- **End-to-end facts of this machine** (from §1.4): relative geometry only — `screen.getCursorScreenPoint()` returns `0,0` on Wayland and window position/size are unreliable; no screen-level screenshots — pixels come from `webContents.capturePage()`; injected input needs an explicitly focused window (`win.focus()`, `webContents.focus()`); pointer and wheel injection goes through CDP (`webContents.debugger`), never `sendInputEvent` for wheel.
- **SP0's tests are the floor, not a casualty:** `test/no-min-infrastructure.test.js` and the identity tests scan `js/`, `main/`, `pages/`, `reader/` and the root `index.html` — the new files must not mention Min, `minbrowser` or Min's endpoints.
- **Commit style:** lowercase type prefix (`feat:`, `fix:`, `docs:`), explanatory prose body. One task is one commit (or a couple for the big ones), and every commit leaves `npm run test:unit` and `npm run test:lint` green.
- **The chrome layer stays idle when retracted** (R8): no `setInterval`, no animation loop, no polling. Pointer reporting is a passive, throttled listener.

---

## Facts from the design spike (do not re-learn these)

| Fact | Consequence here |
| --- | --- |
| `webContents.sendInputEvent` is dropped unless the window is focused | Tests call `win.focus()` and `wc.focus()` before injecting; real use has focus (R4) |
| Drag regions (`-webkit-app-region: drag`) deliver hover but **swallow presses** | Every interactive control opts out with `no-drag` (R5); the frame's double-click is not ours (see deviations) |
| CDP `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` deliver; `sendInputEvent`'s wheel does not | All pointer/key injection in tests goes through `webContents.debugger` |
| Wayland: no cursor position, unreliable window position/size | Every geometric assertion is relative to the window's own content bounds |
| `capturePage()` corner probes proved clean at radius 0/12/25 px | SC1's pixel assertions use exactly this method |
| `capturePage()` hands back an **opaque** bitmap: a transparent area of the page arrives white, alpha 255 (measured on the chrome layer's own capture), and `border-radius` does **not** clip hit testing | Corner assertions compare pixels against the frame's token colour - "the frame paints here / does not paint here" - never against alpha; the window's transparency is asserted by the source test and `getBackgroundColor()`, not by a pixel |
| With no window manager behind the test display, the window never loses focus: `win.blur()` leaves `isFocused()` true and fires neither `focus` nor `blur` (measured) | No spec can produce a real blur. The reveal's blur case emits the event onto the window and says so, and proves the handler and the applied answer; the rule itself is `test/chromeReveal.test.js`'s |
| `capturePage()` returns the **last presented frame**: a pixel read immediately after a style change can still show the previous colour (caught by the theme-repaint case, which passed alone and failed in the full suite) | Every pixel assertion that follows a change waits for the pixel, never for the DOM property - the same shape Task 9's live-radius loop needs |
| Electron's `webContents.getTitle()` is a main-process cache that **lags** the document's title (measured: page `complete` and titled while the cache still returned the URL, up to ~1 s under load) | Specs that assert on a tab's title must wait for the cache; the harness's `openShortUrl` does |
| Wheel over the frame is unverified | M2's problem (strip scrolling); M1 has no wheel behaviour |

---

## Review Focus

Five things the tasks' tests do not prove. The reviewer should check them by reading, and by hand where noted.

1. **Every path that attaches a tab view re-establishes the chrome layer's stacking.** Task 3 covers `setView` and `loadURLInView`; the reviewer greps `addChildView` across `main/` (popups, window restore, future callers) and satisfies themselves that a missed path can only show as the page covering the frame — the fastest regression in this milestone.
2. **The interim commits keep a working URL editor.** Before Task 8 the old navbar is still visible under a 12 px frame; Tasks 3–7 must not leave a commit where neither the old editor nor the new pill can be driven. The task order (address pill before the swap) is load-bearing: do not reorder.
3. **Focus ownership.** The pill focuses the chrome layer; after Enter the page must have focus again, and revealing the island must never steal focus from the page (R7 — the box is opened *before* the pill is focused). Check `main/chromeLayer.js` and `js/chrome/address.js` by reading, and by hand with a keyboard-only session.
4. **A non-compositing window manager must not break startup** (R2). Transparency is the look, not a requirement: on a WM without compositing the window must still open and work (square corners are acceptable). Task 1's e2e runs under a bare X server; the maintainer checks their own Wayland session once at the end.
5. **The retracted chrome layer is idle** (R8). `js/chrome/pointer.js` is a passive consumer with a ~50 ms throttle; nothing in `js/chrome/` starts a timer or a rAF loop when the state is closed. Read the module once with this question in mind.

---

## Task 1: Window identity — always frameless, always transparent; the setting retires

The window becomes what §4.1 describes, unconditionally, and `useSeparateTitlebar` stops existing as a setting.

**Files:**
- Modify: `main/main.js` (the `BaseWindow` options at ~:193–206)
- Modify: `pages/settings/index.html` (the `#section-separate-titlebar` block at ~:179–185), `pages/settings/settings.js` (~:9, ~:306–317)
- Modify: `js/windowControls.js` (~:4–6), `css/windowControls.css` (the `.separate-titlebar` selectors)
- Modify: `js/webviews.js` (~:8, ~:161) — drop the `hasSeparateTitlebar` variable, keep the `(linux || windows) && !maximized && !fullscreen` branch
- Test: `test/no-separate-titlebar.test.js` (new), `test/e2e/chrome.spec.js` (new — the window-options assertions)

**Interfaces:**
- Window options become: `frame: false`, `transparent: true`, `backgroundColor: '#00000000'`, `titleBarStyle: 'hidden'`, everything else unchanged. Keep the comment about Electron issue #10559 updated to say the value is now the transparent one.
- The *behaviour* of the interim band is unchanged (still 48 px on Linux when not maximised), so this commit cannot move the page.

- [ ] **Step 1: Write the failing source test.** `test/no-separate-titlebar.test.js` walks `js/`, `main/`, `pages/`, `css/` and asserts no file contains the string `useSeparateTitlebar` or `separate-titlebar`; it also asserts `main/main.js` contains `frame: false` and `transparent: true` — the option *values* are the thing the setting can no longer vary, and there is no runtime getter for `frame`. Follow `test/helpers/repo.js` for directory walking and `test/identity.test.js` for the assertion voice.
- [ ] **Step 2: Run it and watch it fail:** `node --test test/no-separate-titlebar.test.js`.
- [ ] **Step 3: Make the edits.** `main/main.js`: delete both `settings.get('useSeparateTitlebar')` expressions, add `frame: false`, `transparent: true`, change `backgroundColor` to `'#00000000'`. `js/webviews.js`: the `else` branch becomes `if ((window.platformType === 'linux' || window.platformType === 'windows') && !windowIsMaximized && !windowIsFullscreen) { var navbarHeight = 48 } else { var navbarHeight = 36 }`. `js/windowControls.js`: delete the `separate-titlebar` body-class branch. `css/windowControls.css`: delete `:not(.separate-titlebar)` from the two selectors (the rule still applies to non-maximised, non-fullscreen windows). `pages/settings/index.html`: delete the whole `#section-separate-titlebar` div. `pages/settings/settings.js`: delete `var separateTitlebarCheckbox …` and its two blocks. **Do not touch `localization/`** — the key stays.
- [ ] **Step 4: Add the runtime assertions to `test/e2e/chrome.spec.js`** (new file; it grows through this plan). First test: after `launchApp`, read the window in main and assert `win.getBackgroundColor()` has alpha `0` (string form `rgba(0, 0, 0, 0)` — normalise with a regex over the returned string; if `BaseWindow` has no `getBackgroundColor` in 43.4.1, assert instead that `win.getContentBounds()` matches the window's visible size and leave the transparency claim to the source test, noting it in the spec comment). Second test: the settings page no longer contains `#checkbox-separate-titlebar` (reuse `ensureSettingsPage` from the harness).
- [ ] **Step 5: Run the gates:** `npm run test:unit`, `npm run test:lint`, then `npm run test:e2e` (this is the first chrome spec; a full local run is minutes, not hours).
- [ ] **Step 6: Commit** — `feat: make Mercury's window frameless and transparent, and retire useSeparateTitlebar` with a body explaining that the frame is now ours in both states and why the locale key survives.

---

## Task 2: The chrome page builds — tokens, reveal geometry, frame

Build the page, its bundle, its stylesheet and its two shared value modules. Nothing is on screen yet; the modules are pure and tested.

**Files:**
- Create: `js/chrome/tokens.js`, `js/chrome/reveal.js`, `js/chrome/chromeSettings.js`
- Create: `scripts/buildChrome.js`; modify `package.json` (the `build` script chain), `scripts/watch.js`, `scripts/buildMain.js`
- Create: `pages/chrome/index.html`, `css/chrome.css`
- Create: `js/chrome/default.js`, `js/chrome/frame.js`
- Test: `test/chromeTokens.test.js`, `test/chromeReveal.test.js`, `test/chromeBuild.test.js`

**Interfaces:**

`js/chrome/tokens.js` — the default token table (§4.10's contract, with two additions this milestone needs), the state heights, and the single source for the frame height:

```js
var chromeTokens = {
  frameHeight: 12, islandGap: 12, islandHeight: 53, cardHeight: 40,
  light: { '--strip-h': '12px', '--island-h': '53px', '--island-gap': '12px', '--frame-bg': '#f6f6f6', '--hairline': 'rgba(0, 0, 0, 0.12)', '--pill': 'rgba(0, 0, 0, 0.20)', '--text': '#1c1c1e', '--accent': '#4457c8', '--island-bg': '#f6f6f6', '--island-shadow': '0 2px 12px rgba(0, 0, 0, 0.18)', '--island-radius': '12px', '--r-window': '12px', '--r-page': '20px', '--strip-gap': '4px', '--strip-pad': '6px', '--strip-align': 'safe center', '--pill-w': '26px', '--pill-active-w': '38px', '--pill-h-frame': '4px', '--pill-h-island': '16px' },
  dark: { …the same keys, AMOLED: '--frame-bg': '#000000', '--island-bg': '#000000', '--hairline': 'rgba(255, 255, 255, 0.16)', '--pill': 'rgba(255, 255, 255, 0.28)', '--text': '#f2f2f7', '--accent': '#8f9dff', '--island-shadow': '0 2px 14px rgba(0, 0, 0, 0.85)'… },
  boxHeight: function (state) { /* 'closed' → frameHeight; 'open' → frameHeight + islandGap + islandHeight (77); 'cards' → frameHeight + islandGap + cardHeight (64) */ }
}
if (typeof module !== 'undefined') { module.exports = chromeTokens }
```

The two additions: `--pill-h-frame` satisfies §4.3's formula (`--strip-h − 8px` = 4 px) and `--pill-h-island` is the island's pill height, which §4.3 does not state — M3 may revise it; note that in a comment. `--r-page`'s token value is only a fallback: the setting rules (§4.10).

`js/chrome/reveal.js` — main's decision function, pure:

```js
var chromeReveal = {
  /* report: { source: 'chrome' | 'page' | 'blur', y: windowCoordinates, frameHeight, tolerance }
     state:  'closed' | 'open'
     returns 'open' | 'closed' | 'stay' */
  next: function (state, report) {
    if (report.source === 'blur') return state === 'closed' ? 'stay' : 'closed'
    var zone = report.frameHeight + report.tolerance
    if (report.y <= zone) return state === 'open' ? 'stay' : 'open'
    if (report.source === 'page') return state === 'open' ? 'closed' : 'stay'
    return 'stay' /* inside the chrome box, below the frame band: the open island keeps its pointer */
  }
}
```

M1 has no corridor, no grace timer, no overshoot rule (§4.6's remainder is M3); document that at the top of the file. `state: 'cards'` arrives in M3.

`js/chrome/chromeSettings.js` — the two new settings, declared once, shared by main and the tests:

```js
var chromeSettings = {
  pageCornerRadius: { key: 'pageCornerRadius', default: 20, min: 0, max: 100, clamp: function (v) { … } },
  hoverTolerance: { key: 'hoverTolerance', default: 0, min: 0, max: 24, clamp: function (v) { … } }
}
```

Clamps: non-numeric or `undefined` → the default; otherwise `Math.min(max, Math.max(min, v))`, rounded to an integer.

`scripts/buildChrome.js` — modelled on `scripts/buildBrowser.js`: prepend `dist/localization.build.js` (so `l()` exists in the page), browserify `js/chrome/default.js` with `paths: [rootDir, jsDir]`, `node: true`, `detectGlobals: false`, `instance.transform(renderify)`, exclude `chokidar`, write `dist/chrome.js`. No CSS step: the page links `/css/chrome.css` directly, the way `pages/settings/index.html` links `../../css/base.css`.

`pages/chrome/index.html` — head: `Content-Security-Policy: default-src 'self'; script-src 'self'; img-src 'self' data: https: http:` (the `img-src` is for favicons), `<link rel="stylesheet" href="/css/chrome.css">`, `<script src="/dist/chrome.js"></script>` at the end of the body. Body:

```html
<body class="chrome ct-closed">
  <div id="frame"><div id="strip"></div></div>
  <div id="island" hidden></div>   <!-- strip is re-parented in here when open -->
</body>
```

`css/chrome.css` — no colour literals: everything is `var(--token)` with the JS-applied defaults. The rules that matter:

```css
html, body { height: 100%; margin: 0; overflow: hidden; background: transparent; }
#frame { position: absolute; inset: 0 0 auto 0; height: var(--strip-h); background: var(--frame-bg);
         border-radius: var(--r-window) var(--r-window) 0 0; -webkit-app-region: drag; }
#frame::after { /* the hairline, stopping --r-page short of each end so it meets the page's arc (§4.7) */
  content: ''; position: absolute; left: var(--r-page); right: var(--r-page); bottom: 0; height: 1px;
  background: var(--hairline); }
#strip { display: flex; align-items: center; justify-content: var(--strip-align); gap: var(--strip-gap);
         padding: 0 var(--strip-pad); height: 100%; overflow: hidden; }
.pill { flex: none; width: var(--pill-w); border-radius: 999px; background: var(--pill);
        -webkit-app-region: no-drag; }
.pill.active { width: var(--pill-active-w); background: var(--accent); }
#frame .pill  { height: var(--pill-h-frame); }   /* 4px — the frame is 12px tall (§4.3's formula) */
#island .pill { height: var(--pill-h-island); }  /* 16px — the island's row is taller */
#island { position: absolute; top: calc(var(--strip-h) + var(--island-gap)); left: var(--island-gap);
          right: var(--island-gap); height: var(--island-h); display: flex; align-items: center;
          gap: 8px; padding: 0 8px; background: var(--island-bg); border-radius: var(--island-radius);
          box-shadow: var(--island-shadow); -webkit-app-region: drag; }
#island[hidden] { display: none; }   /* the attribute, not a class: #island{display:flex} beats the UA's [hidden] rule */
#island .pill, #island button, #island input { -webkit-app-region: no-drag; }
```

(`#island` is full-width minus the gap on both sides in M1 — the spec does not fix the island's width; keep it simple and let M3 refine it.)

`js/chrome/default.js` — the entry, mirroring `js/default.js`: `window.electron = require('electron'); window.ipc = electron.ipcRenderer`, the `platformType` body classes (mac/windows/linux), then `require` the page modules and apply `chromeTokens.light` before the first paint. It registers the ipc listeners the page needs across this plan (`chrome-tokens`, `chrome-geom`, `chrome-tabs`, `chrome-nav-state`, `chrome-window-state`, `chrome-focus-address`) — early registration is harmless — and ends with `ipc.send('chrome-ready')`, the handshake that lets main push state without guessing at load timing.

`js/chrome/frame.js` — owns the frame element and the state class:

```js
var frame = {
  el: document.getElementById('frame'),
  island: document.getElementById('island'),
  strip: document.getElementById('strip'),
  setTokens: function (tokens) { for (var k in tokens) { document.documentElement.style.setProperty(k, tokens[k]) } },
  setGeom: function (state /* 'closed' | 'open' */) {
    document.body.classList.toggle('ct-open', state === 'open')
    document.body.classList.toggle('ct-closed', state !== 'open')
    // "the strip grows into the island: one element, one row" — re-parent, do not duplicate
    if (state === 'open') { frame.island.insertBefore(frame.strip, frame.island.firstChild) } else { frame.el.appendChild(frame.strip) }
    frame.island.hidden = state !== 'open'
  }
}
```

- [ ] **Step 1: Write the failing unit tests.**
  - `test/chromeTokens.test.js`: `boxHeight('closed') === 12`; `boxHeight('open') === 77`; `boxHeight('cards') === 64`; `parseInt(light['--strip-h'], 10) === frameHeight`; `parseInt(light['--island-h'], 10) === islandHeight`; `parseInt(light['--island-gap'], 10) === islandGap`; the §4.10 contract key list is present in **both** `light` and `dark`; `light['--pill-h-frame'] === String(frameHeight - 8) + 'px'`; every colour token parses as a CSS colour (hex or `rgba(`).
  - `test/chromeReveal.test.js`: table-driven — hovering the frame band opens; at tolerance 0 a page report at y = 13 closes an open island and never opens a closed one; at tolerance 24 a page report at y = 20 opens it; a chrome report at y = 40 while open stays open; `blur` closes only when open.
  - `test/chromeBuild.test.js`: `scripts/buildChrome.js` exists; `package.json`'s `build` script invokes it; `scripts/watch.js` rebuilds it; `pages/chrome/index.html` and `css/chrome.css` exist; `scripts/buildMain.js` lists `js/chrome/tokens.js`, `js/chrome/reveal.js`, `js/chrome/chromeSettings.js`.
- [ ] **Step 2: Run them and watch them fail:** `node --test test/chromeTokens.test.js test/chromeReveal.test.js test/chromeBuild.test.js`.
- [ ] **Step 3: Write the modules and the page** to the interfaces above.
- [ ] **Step 4: Run the build and the suites:** `npm run build` (must produce `dist/chrome.js`), `npm run test:unit`, `npm run test:lint`. Add `dist/chrome.js` to `.gitignore` if `dist/` is not already ignored (check `git check-ignore dist/bundle.js`).
- [ ] **Step 5: Commit** — `feat: build the chrome page, its tokens and the reveal geometry`.

---

## Task 3: The chrome layer exists above the page — creation, geometry, stacking

Main gets the layer: created with the window, positioned by main alone, kept on top of whatever view is attached, and destroyed with the window. The chrome page shows the frame and nothing else yet.

**Files:**
- Create: `main/chromeLayer.js`; modify `scripts/buildMain.js` (add `main/chromeLayer.js` after `main/main.js`)
- Modify: `main/main.js` (create the layer inside `createWindowWithBounds`, extend the resize handler), `main/windowManagement.js` (`windowFromContents`)
- Modify: `main/viewManager.js` (`setView`, `loadURLInView` — re-raise)
- Modify: `test/e2e/harness.js` (the chrome-layer helpers)
- Test: `test/e2e/chrome.spec.js`

**Interfaces:**

`main/chromeLayer.js` (globals in `main.build.js`, like every main module):

```js
var CHROME_PAGE_URL = 'mercury://app/pages/chrome/index.html'

var chromeLayer = {
  create: function (win) { /* WebContentsView, nodeIntegration: true, contextIsolation: false, the same additionalArguments as mainView; loadURL(CHROME_PAGE_URL); addChildView(win.contentView, layer) *after* mainView; win.on('closed', destroy) */ },
  destroy: function (win) { /* webContents.destroy() once; drop the per-window record */ },
  view: function (win) { return layerOrNull },
  hasContents: function (win, webContentsId) { /* for windows.windowFromContents */ },
  raise: function (win) { /* removeChildView + addChildView — the layer is always last */ },
  updateGeometry: function (win) { /* state = state(win); boxH = chromeTokens.boxHeight(state); view.setBounds({x: 0, y: 0, width: win.getContentBounds().width, height: boxH}); view.webContents.send('chrome-geom', { state, boxH }) */ },
  send: function (win, channel, data) { /* guard isDestroyed */ },
  pushTokens: function (win) { /* { dark, tokens } for the current darkThemeIsActive */ },
  state: function (win) { return 'closed' }, // Task 4 changes this
  setState: function (win, state) { /* updateGeometry after */ }
}
```

Per-window records live in a module-local `WeakMap` (`var chromeLayers = new WeakMap()`); nothing is added to `windows.getState`.

Wiring in `main/chromeLayer.js` (module load time, like the other main modules):
- `ipc.on('chrome-ready', e => { const win = windows.windowFromContents(e.sender)?.win; pushTokens(win); updateGeometry(win) })`
- `settings.listen('darkThemeIsActive', () => windows.getAll().forEach(pushTokens))`
- (Task 4 adds `ipc.on('chrome-pointer')` and `ipc.on('page-pointer')`.)

`main/windowManagement.js` — `windowFromContents` matches the chrome layer too, so every existing `windows.windowFromContents(e.sender)` handler (window controls, dialogs, `setFullScreen`, …) works from the chrome page:

```js
windowFromContents: function (webContents) {
  return windows.openWindows.find(w => getWindowWebContents(w.win).id === webContents.id || chromeLayer.hasContents(w.win, webContents.id))
}
```

`main/main.js` — extract the `additionalArguments` array into `function viewAdditionalArguments (customArgs) { … }` used by both `mainView` and the chrome layer; create the layer right after `newWin.contentView.addChildView(mainView)`; in the `resize` handler call `chromeLayer.updateGeometry(newWin)` inside the same `setTimeout`, and update the layer's *width* with it. Create it **before** `windows.addWindow(newWin)` so `--window-id` matches `mainView`'s (both read `windows.nextId` before it increments).

`main/viewManager.js` — after each `addChildView` of a tab view (`setView`, `loadURLInView`), call `chromeLayer.raise(win)`. `setView`'s mass-removal (`children.slice(1).forEach(removeChildView)`) may detach the layer; `raise` puts it back, so the order is self-healing.

Harness additions (`test/e2e/harness.js`), all driven from `inMain` because a `WebContentsView` is not a Playwright page:

```js
const CHROME_PAGE = 'mercury://app/pages/chrome/index.html'
const UI_URL = 'mercury://app/index.html'                 // launchApp must match this exactly (the chrome page also lives under mercury://app/)
const layerFacts  = app => inMain(app, …)                 // { found, bounds, isLastChild, childOrder: [urls] } for the window's contentView
const chromeDom   = (app, script) => inMain(app, …)       // executeJavaScript in the chrome page, returns the value
const cdp         = (app, url, commands) => inMain(app, …) // attach wc.debugger('1.3'), run Input.dispatch* commands in order, detach
const pixels      = (app, url, points) => inMain(app, …)  // capturePage() → toBitmap() → [{x,y,r,g,b,a}] at the given points
```

`launchApp`'s window finder changes from `page.url().startsWith('mercury://app/')` to `page.url() === UI_URL` — leaving it as a prefix match would let the chrome layer satisfy it if Playwright ever exposes `WebContentsView` pages (the floor of SC11). Every main-side helper that needs "the window" must find the **browser** window structurally (the one whose `contentView.children` include the UI page): `BaseWindow.getAllWindows()` also holds the app's hidden history-service window on every run, so index-0 lookups are wrong from here on.

- [ ] **Step 1: Write the failing e2e spec** (`test/e2e/chrome.spec.js`, new `test` block): after `launchApp` plus one navigation (drive it through the old editor for now — Task 6 rewrites the helper), assert: the chrome layer exists with bounds `{x: 0, y: 0, width: contentWidth, height: 12}`; it is the **last** child of the window's contentView (above the tab view); the chrome page's `#frame` is present, its computed `height` is `12px`, and it is painted with the token table the theme in force selects (`#f6f6f6` light, `#000000` dark); and the **corner pixels**, as implemented: `(12,1)` and `(25,0)` are the frame's token colour while `(0,0)` and `(1,1)` are not (the spike's 0/12/25 probe, read as paint and not as alpha — see the fact table).
- [ ] **Step 2: Run it and watch it fail:** `npx playwright test test/e2e/chrome.spec.js`.
- [ ] **Step 3: Implement** the module, the wiring and the harness helpers.
- [ ] **Step 4: Run the suites:** `npm run test:unit`, `npm run test:lint`, `npm run test:e2e` (the whole e2e suite, to catch the harness change).
- [ ] **Step 5: Commit** — `feat: add the chrome layer above the tab views`.

---

## Task 4: The island summons — pointer reports and the reveal state machine

Main learns where the pointer is and opens the box when it enters the frame band. The island's row is empty after this task; Tasks 5–7 fill it.

**Files:**
- Create: `js/preload/pointerReports.js`; modify `scripts/buildPreload.js`
- Create: `js/chrome/pointer.js`
- Modify: `main/chromeLayer.js` (state, `revealFrom`), `js/chrome/default.js` (wire `chrome-geom` → `frame.setGeom`, `pointer.initialize()`)
- Test: `test/e2e/chrome.spec.js` (add cases), `test/chromeReveal.test.js` (already covers the table; add a case only if a rule changed)

**Interfaces:**

`js/preload/pointerReports.js` (main frame only, passive, ~50 ms throttle):

```js
if (window.parent === window) {
  var lastReport = 0
  document.addEventListener('mousemove', function (e) {
    var now = Date.now(); if (now - lastReport < 50) { return }; lastReport = now
    ipc.send('page-pointer', { y: Math.round(e.clientY) })
  }, { passive: true, capture: true })
}
```

`js/chrome/pointer.js` — the same shape for the chrome layer, reporting `chrome-pointer` with `{ y }` and, when the pointer leaves the document (`mouseout` with `relatedTarget === null`), `{ y, leave: true }`. `leave` is reported but ignored in M1 (M3's corridor uses it); say so in a comment.

`main/chromeLayer.js`:

```js
ipc.on('chrome-pointer', function (e, report) {
  var win = windows.windowFromContents(e.sender)?.win; if (!win) { return }
  revealFrom(win, { source: 'chrome', y: report.y })
})
ipc.on('page-pointer', function (e, report) {
  var win = getWindowFromViewContents(e.sender)
  if (!win) { return }
  var viewBounds = getView(windows.getState(win).selectedView)?.getBounds() || { y: 0 }   // view coordinates → window coordinates
  revealFrom(win, { source: 'page', y: viewBounds.y + report.y })
})
function revealFrom (win, report) {
  var state = chromeLayer.state(win)
  var next = chromeReveal.next(state, {
    source: report.source, y: report.y,
    frameHeight: chromeTokens.frameHeight,
    tolerance: chromeSettings.hoverTolerance.clamp(settings.get('hoverTolerance'))
  })
  if (next !== 'stay') { chromeLayer.setState(win, next) }
}
// inside create(win):
win.on('blur', function () { revealFrom(win, { source: 'blur' }) })
```

`setState` updates the stored state, calls `updateGeometry(win)` — which sends `chrome-geom` — and, **after** the box is open, may move focus (Task 6's rule, R7: never focus before the box grows).

`js/chrome/default.js` gains `ipc.on('chrome-geom', (e, d) => frame.setGeom(d.state))` and `pointer.initialize()`.

- [ ] **Step 1: Add failing e2e cases** to `chrome.spec.js`: (a) `win.focus()` + CDP `mouseMoved` at `(120, 6)` in the chrome page ⇒ within 2 s the layer's bounds height is 77 and the chrome page reports `document.body.classList.contains('ct-open')` and `#island.hidden === false`; (b) then CDP `mouseMoved` at `(120, 400)` in the **tab view** ⇒ height back to 12 and `ct-open` gone (each case opens the box itself, so a case that only closes it cannot pass before the feature exists); (c) with the island open, a blur ⇒ closed, delivered as an emitted event on the window because this environment cannot really blur one (fact table).
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Suites:** as in Task 3.
- [ ] **Step 5: Commit** — `feat: summon the island from the frame band`.

---

## Task 5: The strip shows the real tabs

The pills become real: the UI page publishes the tab summaries, main relays them to the window's chrome layer, the chrome page renders them and a click switches tabs.

**Files:**
- Create: `js/chromeBridge.js` (UI page); modify `js/default.js` (initialize it in the bootstrap block)
- Modify: `main/chromeLayer.js` (`ipc.on('chrome-tabs')`, `send(win, 'chrome-tabs', …)`)
- Create: `js/chrome/strip.js`; modify `js/chrome/default.js`
- Test: `test/e2e/chrome.spec.js`, `test/e2e/harness.js` (the `newTab` helper)

**Interfaces:**

`js/chromeBridge.js` (UI page, the only place tab state leaves the UI page):

```js
/* Publishes the tab summary the chrome layer renders, and applies the commands it sends back. */
var chromeBridge = {
  initialize: function () {
    ['tab-added', 'tab-updated', 'tab-destroyed', 'tab-selected', 'tab-splice',
     'task-added', 'task-destroyed', 'task-updated', 'task-selected'
    ].forEach(function (name) { tasks.on(name, function () { chromeBridge.publish() }) })
    webviews.bindEvent('did-start-loading', function () { chromeBridge.publishNavState(true) })
    webviews.bindEvent('did-stop-loading', function () { chromeBridge.publishNavState(false) })
    ipc.on('chrome-action', function (e, data) { chromeBridge.applyAction(data) })
    chromeBridge.publish()
  },
  publish: function () { /* rAF-coalesced; ipc.send('chrome-tabs', summary()) */ },
  summary: function () {
    var selected = tabs.getSelected()
    return {
      selected: selected,
      tabs: tabs.get().map(function (tab) {
        return {
          id: tab.id, active: tab.id === selected, private: tab.private, title: tab.title || '',
          accent: tab.themeColor?.color || tab.backgroundColor?.color || null,
          atRest: /* hostname minus www for http(s); urlParser.prettyURL(url) otherwise; '' when the tab has no URL */,
          fullUrl: tab.url || '',
          faviconUrl: tab.favicon?.url || null
        }
      })
    }
  },
  // navigation and loading state for the island's controls (Task 7)
  publishNavState: function (loading) { /* webviews.callAsync(selected, 'canGoBack'|'canGoForward') → ipc.send('chrome-nav-state', { canGoBack, canGoForward, loading }) */ },
  // every command from the chrome layer lands here; M1 knows these:
  applyAction: function (data) { switch (data.action) {
    case 'selectTab': browserUI.switchToTab(data.tabId); break
    case 'navigate': /* Task 6 */
    case 'goBack': … 'goForward': … 'reload': … 'stop': /* Task 7 */
  } }
}
```

`tabs.get()` is the selected task's tabs, in order — the strip shows that task's tabs, exactly as Min's tab strip does; the overview (M2) is where other tasks appear. Say so in a comment.

**As implemented, the summary carries only what a pill renders:** `{ tabs: [{ id, active, title, accent }] }` — the tooltip is `title`, the active pill's colour is `accent` (`themeColor.color || backgroundColor.color || null`, with the stylesheet's `--accent` as the fallback). No `private`, no `atRest`, no `fullUrl`, no `faviconUrl`: each arrives with the consumer that reads it (M2's overview, Task 6's address pill). The payload has no `selected` field either — `active` per pill says it.

**And the id is sent as the string the summary gave it.** `js/tabState` compares ids with `===` throughout (`has`, `getIndex`, `setSelected`), so the plan's original `Number(pill.dataset.tabId)` would name a tab that does not exist: `tabs.has()` would fail, `setSelected` would throw, and the press would do nothing. `chromeBridge.applyAction` also has to tolerate a stale id — a press can cross a close — so it asks `tabs.get(data.tabId)` before switching rather than throwing.

`main/chromeLayer.js`: `ipc.on('chrome-tabs', e => …)` keeps the summary on the window's layer entry (`layer.tabs`) and pushes it, and `ipc.on('chrome-action', …)` relays a chrome command to the window's UI page (`getWindowWebContents(win).send('chrome-action', data)`). The same relay shape serves `chrome-nav-state` in Task 7.

**The summary is kept, not just relayed:** the two pages load in no fixed order, so a publish that lands before the chrome page's bundle has run would be lost — the reason the handshake exists. `chrome-ready` re-sends the kept summary (`chromeLayer.pushTabs`), which is also what makes the strip appear on a window whose UI page published first. When nothing has been published yet, the page shows an empty row rather than a wrong one.

`js/chrome/strip.js`:

```js
var strip = {
  signature: '',
  update: function (summary) { /* rebuild only when the signature (ids + active flags + accents) changed */ },
  render: function (summary) {
    // one .pill per tab: data-tab-id, role="tab", aria-selected, title = tab.title,
    // active pill style.background = tab.accent || '' ('' falls back to var(--accent))
  },
  onClick: function (pill) { ipc.send('chrome-action', { action: 'selectTab', tabId: pill.dataset.tabId }) } // the string, never Number()ed: see above
}
```

Click only in M1 — middle-click close, right-click menu, wheel scroll and drag scrolling are M2 (§5); do not build them. **The hit box, not the drawing, is the target:** §4.3 says a pill's hit box is the frame's full height, so the pill element fills the row (`height: 100%`) and an inner `.pill-bar` draws the bar — Task 2 shipped the drawing height on the element itself, which leaves a 4 px target and is wrong. The accent colour goes on the bar for the same reason. Assert both numbers: the pill's `getBoundingClientRect().height` equals the row's (12 px in the frame) and the bar's is `--pill-h-frame` (4 px).

Harness: `const newTab = app => inMain(app, …)` which sends `'addTab'` to the UI page's webContents — **exactly the message the application menu's New Tab item sends** (`main/menu.js:26`), because a native menu cannot be clicked by a test. Comment that provenance at the definition.

- [ ] **Step 1: Add failing e2e cases:** one tab ⇒ exactly one pill whose `data-tab-id` is in the summary, `aria-selected === 'true'`; `newTab(app)` ⇒ two pills, the *older* pill id still first (order preserved); CDP-click the first pill ⇒ the first pill becomes `aria-selected` and `inMain` reports `windows.getState(win).selectedView` equal to the first pill's tab id; the active pill's computed background is not the inactive pill's.
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Suites.**
- [ ] **Step 5: Commit** — `feat: render the real tabs as pills in the strip`.

---

## Task 6: The address pill edits and navigates

The island's middle element becomes a working address bar, and every path that used to open Min's editor now opens this one. This is the task that makes the swap (Task 8) safe.

**Files:**
- Create: `js/chrome/address.js`; modify `js/chrome/default.js`, `css/chrome.css`
- Modify: `js/chromeBridge.js` (`navigate`, `focusAddress`), `main/chromeLayer.js` (`chrome-focus-address`, focus ownership), `js/main.js`-adjacent: `js/defaultKeybindings.js` (`enterEditMode`, `runShortcut`), `js/menuRenderer.js` (`openEditor`, `showBookmarks`, `showHistory`), `js/sessionRestore.js`, and any `tabEditor.show(` found by the grep in Step 3
- Modify: `test/e2e/harness.js` (`openAddressBar` + `enterUrl` now drive the chrome layer)
- Test: `test/e2e/chrome.spec.js`, `test/e2e/launch.spec.js` and the rest of the existing suite must stay green through the rewritten helpers

**Interfaces:**

`js/chrome/address.js`:

```js
var address = {
  el: /* #address: <img id="address-favicon"> + <input id="address-input" readonly> */,
  editing: false,
  update: function (summary) { /* the active tab's entry: at rest the input shows summary.atRest, favicon visible; on hover (not editing) it shows summary.fullUrl; never overwrite text being edited */ },
  beginEdit: function () { address.editing = true; input.readOnly = false; input.value = fullUrl; input.select(); input.focus() },
  endEdit: function (keep) { address.editing = false; input.readOnly = true; /* value returns to atRest on the next update */ },
  onKeyDown: function (e) {
    if (e.key === 'Enter') { var v = input.value.trim(); address.endEdit(); if (v && v !== fullUrl) { ipc.send('chrome-action', { action: 'navigate', value: v }) } else { ipc.send('chrome-action', { action: 'retract' }) } ; return }
    if (e.key === 'Escape') { address.endEdit(); ipc.send('chrome-action', { action: 'retract' }) }
  },
  focus: function (value) { /* called by chrome-focus-address: the box is already open (main opened it first); beginEdit(); if (value) { input.value = value } */ }
}
```

Click on the pill ⇒ `beginEdit()`; blur ⇒ `endEdit()`. Escape **inside an edit** cancels the edit; when not editing, Escape retracts (§4.4) — the "second Escape retracts" in the spec falls out of that for free.

`js/chromeBridge.js`:

```js
case 'navigate': searchbar.events.emit('url-selected', { url: data.value, background: false }); webviews.focus(); break
   // the existing handler (js/browserUI.js:270) parses and calls webviews.update on the selected tab, and hides the old editor
case 'focusAddress': /* no — this one is main-side */
```

`focusAddress` is a UI-page function that sends the *main* message, because only main knows the box:

```js
focusAddress: function (value) { ipc.send('chrome-focus-address', { value: value || null }) }
```

`main/chromeLayer.js`: on `chrome-focus-address`, `setState(win, 'open')` **first** (R7), then `send(win, 'chrome-focus-address', { value })`. On any transition to closed, return focus to the page: `getView(windows.getState(win).selectedView)?.webContents.focus()`.

The UI-side rebinds — the grep `tabEditor.show(` is authoritative; route each to `chromeBridge.focusAddress(...)`, passing the prefill where one existed (`runShortcut`, the `!bookmarks ` / `!history ` prefills) and nothing where it did not:
- `js/defaultKeybindings.js` `enterEditMode` → `chromeBridge.focusAddress()`
- `js/defaultKeybindings.js` `runShortcut`, and the two bang-prefilled shortcuts → `chromeBridge.focusAddress()` with the same prefill (inert in M1 — there is no suggestion list until M3; the pill will simply hold the text)
- `js/menuRenderer.js` `openEditor` → `focusAddress()`; `showBookmarks` / `showHistory` → `focusAddress()` (no prefill)
- `js/sessionRestore.js` (three `tabEditor.show` calls) → `focusAddress()`
- `js/taskOverlay/taskOverlay.js`, `js/userscripts.js`, `js/searchbar/bangsPlugin.js`, `js/searchbar/bookmarkManager.js`, `js/searchbar/customBangs.js`: leave `tabEditor.hide()` calls alone (harmless — the element exists), but any `tabEditor.show` reachable by a user command goes through `focusAddress`.

Harness rewrite: `openAddressBar(ui)` and `enterUrl(ui, url)` stop touching `#tab-editor-input`. New shape, driven as a user drives it: `win.focus()` → CDP `mouseMoved` into the chrome layer at `(120, 6)` → wait for `ct-open` → read `#address-input`'s rect in the chrome page → CDP `mousePressed`/`mouseReleased` at its centre → CDP `Input.insertText` with the URL → assert the input's value → CDP `Input.dispatchKeyEvent` (Enter: `keyDown` + `char` + `keyUp`, `windowsVirtualKeyCode: 13`) → the navigation happens. Keep the helper's doc comment, rewritten to explain the new path and why CDP is used (Playwright's synthetic keys never reach `before-input-event`).

- [ ] **Step 1: Add failing e2e cases:** `enterUrl(ui, 'mercury://settings')` reaches the settings page (the rewritten helper proves itself); Escape cancels a typed value and `webContentsList` shows no new URL; with the island open, the focused webContents is the chrome page, and after Enter it is the tab view again (`webContents.getFocusedWebContents()`).
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement**, including the grep-driven rebind sweep.
- [ ] **Step 4: Suites — the whole e2e suite is the point of this task.** `npm run test:unit`, `npm run test:lint`, `npm run test:e2e`.
- [ ] **Step 5: Commit** — `feat: edit and navigate from the island's address pill`, with a body listing the rebind sites.

---

## Task 7: The island's controls — navigation, menu, window buttons

The island's third element: back, forward, reload/stop, the menu, and the window controls at the right end (§4.4).

**Files:**
- Create: `js/chrome/controls.js`; modify `js/chrome/default.js`, `css/chrome.css`
- Modify: `js/chromeBridge.js` (`goBack`, `goForward`, `reload`, `stop`, nav-state publishing), `main/chromeLayer.js` (action routing for window commands), `main/main.js` (window state pushes)
- Test: `test/e2e/chrome.spec.js`

**Interfaces:**

Buttons in the island row after the address pill, in this order: `#back-button`, `#forward-button`, `#reload-button` (which becomes `#stop-button` while loading), `#menu-button`, then the window group: `#minimize-button`, `#maximize-button` (restore while maximized), `#close-button`. Each carries `data-label` and `aria-label` from existing locale keys (`goBack`, `goForward`, `reload`, `stop`, `openMenu`, `appMenuMinimize`… — pick the keys Min already uses in `js/navbar/*`; **no new locale keys in this task**), and an icon from the existing `ext/icons/iconfont.css` (`i carbon:*` classes).

`js/chrome/controls.js`:

```js
var controls = {
  updateNav: function (state) { /* state = { canGoBack, canGoForward, loading }: disabled attributes, reload⇄stop swap */ },
  updateWindow: function (state) { /* state = { maximized, fullscreen }: maximize ⇄ restore icon+label */ },
  onClick: function (button) { /* ipc.send('chrome-action', { action: button.dataset.action, x, y }) */ }
}
```

`data-action` values and their owner:

| action | handled in |
| --- | --- |
| `goBack`, `goForward`, `reload`, `stop` | UI page: `ipc.send('chrome-action', { action })` → `chromeBridge.applyAction`, using the same `webviews` calls `js/navbar/navigationButtons.js` uses |
| `openMenu` | main: the chrome page sends `ipc.send('showSecondaryMenu', { x: rect.left, y: boxBottom })` directly — the existing handler (`main/main.js:439`) already builds and pops the secondary menu |
| window buttons | **not** routed through `chrome-action`: the chrome page calls the existing `ipcRenderer.invoke('minimize' \| 'maximize' \| 'unmaximize' \| 'close')` handles in `main/remoteActions.js`, which work from the chrome page because Task 3 taught `windowFromContents` about it; `controls.updateWindow` decides which of maximize/unmaximize to invoke |

Window state pushes: in `main/main.js`, on `newWin.on('maximize'|'unmaximize')` (and once after `windows.addWindow`), `chromeLayer.send(newWin, 'chrome-window-state', { maximized: newWin.isMaximized(), fullscreen: newWin.isFullScreen() })`.

`js/chromeBridge.js` extends `publishNavState` to be the single publisher of `chrome-nav-state`, and re-publishes it after every navigation action.

- [ ] **Step 1: Add failing e2e cases:** on a fresh window, back and forward are `disabled`; after `enterUrl` to the settings page and a second navigation, back is enabled and clicking it returns the tab view to the first URL; the maximize button makes `win.isMaximized()` true and the button's label becomes restore; clicking `#minimize-button` makes `win.isMinimized()` true; clicking `#close-button` destroys the **browser** window — asserted as "no window whose children include the UI page survives", not "no windows at all", because the app's hidden history-service window is in `BaseWindow.getAllWindows()` on every run (Task 1's report); clicking `#menu-button` is observed in main (a test listener on `ipcMain.once('showSecondaryMenu')` added *before* the click) and then dismissed by clicking the page, because a popped-up native menu would eat the next CDP input.
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Suites.**
- [ ] **Step 5: Commit** — `feat: navigation, menu and window controls in the island`.

---

## Task 8: The viewport starts at the frame's bottom — the swap

The tab views drop to `y = 12`, which covers the old chrome for good, and the milestone's two boundary criteria (SC3, SC4) get their tests.

**Files:**
- Modify: `js/webviews.js` (`getViewBounds` — the `navbarHeight` computation goes away; `y = chromeTokens.frameHeight`, `height = window.innerHeight − chromeTokens.frameHeight − margins`; keep the HTML-fullscreen branch unchanged)
- Modify: `js/navbar/tabEditor.js` — add a comment at `show()` stating it is unreachable in M1 and retires in M3; do **not** delete the module (see the deviations section)
- Modify: `index.html` — nothing. The markup stays; the views cover it. (Deletion is M3.)
- Test: `test/e2e/chrome.spec.js` — SC3 and SC4's cases

- [ ] **Step 1: Add the failing cases:** (a) after a navigation, the tab view's bounds are `{x: 0, y: 12, width: contentWidth, height: contentHeight − 12}` — the layer's bounds end where the tab view's begin, so the first row is the page's because nothing overlaps it; a capture cannot show that (see the fact table), and the layer's own bottom row is its hairline, so this half is asserted as geometry and not as a see-through pixel; (b) SC4, decisively, with no product-side test hooks: navigate the tab to the settings page, then `executeJavaScript` a counter into the *test's* page context (`window.clicks = 0; document.addEventListener('click', () => window.clicks++)`) — CSP does not apply to `executeJavaScript` — CDP-click the tab view at `(200, 20)` (window y = 32, just below the frame) and read `window.clicks === 1`; repeat with a CDP wheel at the same point and assert `window.scrollY` increased, which is the half of SC4 that touches the chrome layer's absence; (c) after the swap, a CDP-click at window y = 30 leaves the UI page's `#tab-editor` hidden and its `document.body` without `is-edit-mode` — the old chrome is unreachable.
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Make the edit** to `getViewBounds` — and check every caller survives: `webviews.resize()` runs on window maximize/fullscreen; the branches for those states become no-ops for the band but must stay for `viewMargins` (the find bar, the download bar).
- [ ] **Step 4: Suites — the whole e2e suite again**, because every existing spec navigates.
- [ ] **Step 5: Commit** — `feat: start the viewport at the frame's bottom edge`, body: what the swap covers, why the markup stays until M3.

---

## Task 9: Page fillets — `pageCornerRadius`, live

The page paints its own top corners; the setting is live and the pixel proof is the spike's.

**Files:**
- Create: `js/util/pageFilletStyle.js` (pure, guarded), `js/preload/pageCorners.js`; modify `scripts/buildPreload.js`
- Modify: `main/chromeLayer.js` (push `pageStyle` to every tab view; answer `pageStyleRequest`; react to the settings), `main/viewManager.js` (add a small `forEachView(cb)` enumerator over `viewMap`)
- Modify: `pages/settings/index.html`, `pages/settings/settings.js`, `pages/settings/settings.css`, `localization/languages/en-US.json`, `test/fixtures/localization-keys.json`
- Test: `test/pageFilletStyle.test.js`, `test/e2e/chrome.spec.js`

**Interfaces:**

`js/util/pageFilletStyle.js`:

```js
/* The two top-corner gradients for a page radius. Pure; used by the preload (concatenated,
   where `module` may not exist) and tested directly by node --test. */
function pageFilletStyle (radius, outside, hairline) {
  var left = 'radial-gradient(circle at 100% 100%, rgba(0, 0, 0, 0) calc(100% - 1px), ' + hairline + ' calc(100% - 1px), ' + hairline + ' 100%, ' + outside + ' 100%)'
  var right = /* mirrored: circle at 0% 100% */
  return { left: left, right: right, size: radius + 'px' }
}
if (typeof module !== 'undefined') { module.exports = pageFilletStyle }
```

Why `100% … 100%` works: the element is `radius × radius` and the gradient's centre sits in one corner, so `farthest-corner` is exactly `radius` — the arc's hairline lands on the page's own `radius` arc (a comment in the file should say this, because it is not obvious).

`js/preload/pageCorners.js`: main frame only; two `position: fixed` divs appended to `document.documentElement` with `pointer-events: none`, `aria-hidden="true"`, `z-index: 2147483647`, size and `background` from `pageFilletStyle`; styles set through `element.style` only (page CSP must not matter); removed when `radius <= 0`. It sends `ipc.send('pageStyleRequest')` on `DOMContentLoaded` (so a navigating document re-asks) and re-renders on `ipc.on('pageStyle')`.

`main/chromeLayer.js`:

```js
function pageStyle () {
  var tokens = settings.get('darkThemeIsActive') ? chromeTokens.dark : chromeTokens.light
  return { radius: chromeSettings.pageCornerRadius.clamp(settings.get('pageCornerRadius')),
           outside: tokens['--frame-bg'], hairline: tokens['--hairline'] }
}
ipc.on('pageStyleRequest', function (e) { e.sender.send('pageStyle', pageStyle()) })
settings.listen('pageCornerRadius', pushPageStyle)
settings.listen('darkThemeIsActive', pushPageStyle)
function pushPageStyle () { forEachView(function (view) { view.webContents.send('pageStyle', pageStyle()) }) }
```

The preload's `pageStyleRequest` on `DOMContentLoaded` is what covers views created after a push — a new tab asks when its document loads, which is why no per-view hook in `viewManager` is needed. The **chrome layer** needs the radius too, and this is the task that notices: the frame's hairline is inset by `--r-page` so it meets the page's arc (§4.7), and with `--r-page` frozen at its default the gap stays 20 px when the setting says 0 or 100. So `pushPageStyle` also sends the chrome layer a token refresh carrying the clamped radius (`send(win, 'chrome-tokens', { dark, tokens: withRadius })`), which is the same path a theme will use in M4.

The settings page: a new section after the tabs section —

```html
<div class="setting-section" id="section-page-corner-radius">
  <label for="input-page-corner-radius" data-string="settingsPageCornerRadiusRadius"></label>
  <input type="number" id="input-page-corner-radius" min="0" max="100" step="1" />
</div>
```

with `settings.get('pageCornerRadius', cb)` / `settings.set` in `settings.js` and a small `input[type=number]` rule in `settings.css`. One new key in `en-US.json`, **exactly this name** (keys freeze at the first release): `settingsRoundedPageCorners: "Rounded page corners (px, 0 to disable)"` — then regenerate the fixture with the command in Global Constraints.

- [ ] **Step 1: Write the failing tests.** Unit: `pageFilletStyle(0, …)` returns something the caller must treat as "remove" (`size === '0px'`), `pageFilletStyle(20, '#f6f6f6', 'rgba(0, 0, 0, 0.12)')` embeds both colours and the `calc(100% - 1px)` hairline twice, the two gradients mirror each other. E2E: at the default radius the tab view's pixel `(0,0)` is the frame colour and `(22,22)` is the page's background; set the radius to 0 through the settings page (`ui`-driven, as `clickShowDividerCheckbox` does) and the corner becomes the page's background; set it to 100 and the corner pixel remains the frame colour while `(102,102)` is the page's; the change happens **without a reload** (the confirming loop is the live test).
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement** the module, the preload, the pushes and the settings row; regenerate the fixture.
- [ ] **Step 4: Suites** — including `npm run test:unit` (the localization test will fail until the fixture is regenerated; that is the intended sequence).
- [ ] **Step 5: Commit** — `feat: paint the page's top corners from a live setting`.

---

## Task 10: The hidden zone widens — `hoverTolerance`, live

The last M1 setting: the frame band grows downward by 0–24 px.

**Files:**
- Modify: `js/chrome/reveal.js` — nothing (the tolerance is already in `chromeReveal.next`); `main/chromeLayer.js` — the clamp is already read at reveal time; this task's work is the setting's surface and its tests
- Modify: `pages/settings/index.html`, `pages/settings/settings.js`, `localization/languages/en-US.json`, `test/fixtures/localization-keys.json`
- Test: `test/e2e/chrome.spec.js`

- [ ] **Step 1: Add the failing cases:** with the tolerance at its default 0, a CDP `mouseMoved` into the **tab view** at window y = 20 does not open the island (SC2's first half, and the reason the default is 0); set `hoverTolerance` to 24 through the settings page; the same move now opens it; set it back to 0 and the same move closes it. Add a unit case for the clamp (25 → 24, −3 → 0, `'wide'` → 0, `12.6` → 13).
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement** the settings row (one new key, **exactly this name**: `settingsChromeHoverTolerance: "Chrome hover tolerance (px above the page's top edge)"`) and regenerate the fixture.
- [ ] **Step 4: Suites.**
- [ ] **Step 5: Commit** — `feat: widen the chrome's hover zone from a live setting`.

---

## Done when

- `npm run test:unit`, `npm run test:lint` and `npm run test:e2e` are green on the branch head, and CI (lint+unit, package build, runtime under xvfb) is green.
- Named evidence exists for **SC1** (corner pixels at radius 0/20/100, layer corner transparency), **SC3** (view bounds at y = 12 and a page pixel at y = 12), **SC4** (an injected click at window y = 30 reaches the page), **SC9** (both settings change the running browser without a reload), and **SC11** (SP0's specs, unmodified except for the harness's address helpers).
- The milestone boundary holds: no strip scrolling, no drag-scroll, no keep-in-view, no overview, no morph, no suggestions, no notifications, no Ctrl+Tab cards, no Ctrl+T, no themes, no new tab page.
- The three deviations are on the record — the covered markup, the double-click gesture, and the island's `--pill-h-island` token — and the maintainer has accepted or redirected them.
- A human has launched it once on the maintainer's own Wayland session: the frame is at the top, hovering it opens the island, an address can be typed and navigated, the pills switch tabs, the window controls work, the corners are round, and closing the window returns by the island's close button (the §4.13 debt, now written down for the new tab page in M4).
