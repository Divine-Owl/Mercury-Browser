# Mercury — UI System (Sub-project 1)

**Date:** 2026-10-19
**Status:** Design settled with the maintainer in conversation; pending spec review
**Sub-project:** 1 of 5
**Depends on:** SP0 — Identity & Foundation (merged as PR #1, `0dafcee`)
**Blocks:** SP2 (content-blocking UI), SP3 (memory settings), SP4 (import UI)

---

## 1. Context

### 1.1 What this sub-project is

Mercury is a hard fork of Min v1.35.7 shipped as its own product. SP0 gave it an identity and
severed Min's infrastructure. SP1 gives it a **look**: the chrome, the window's shape, the settings
that style them, and the surfaces a user actually touches.

The product pitch is two claims at once:

1. a **distinctive default appearance** — the viewport *is* the window, with the browser's chrome
   collapsed into a 12-pixel frame that grows into a floating island when asked for;
2. **full restylability** — every visual value is a named token, and a theme is a file of those
   values that anyone can share.

Claim 2 is what makes claim 1 safe: whatever we get wrong, a user can change it.

### 1.2 What exists today

Ground truth from the source in this repository:

| Fact | Where |
| --- | --- |
| The window is a `BaseWindow` — no web contents of its own | `main/main.js:193` |
| The UI is itself a full-bounds `WebContentsView` (`mainView`) loading `index.html` | `main/main.js:214`, `:231` |
| It is frameless by default; the `useSeparateTitlebar` setting restores the system frame | `main/main.js:200`, `:203` |
| Tab views are added to `contentView` **after** it, so they render above all DOM UI | `main/viewManager.js:276`, `:375` |
| View bounds are computed in the renderer, minus the navbar band | `js/webviews.js` (`getViewBounds()`) |

Three consequences shape this whole design:

1. **DOM chrome cannot float over a live page.** Anything painted by the UI page is covered by the
   tab views.
2. **Min's workaround is a placeholder dance.** `webviews.requestPlaceholder(reason)` hides the
   native view and shows a captured screenshot in its place (`js/webviews.js:262`); callers include
   `editMode` (`js/navbar/tabEditor.js:26`), `taskOverlay`, `managerSetup`, `passwordViewer`. While
   the address is being edited, the page is a frozen screenshot — the freeze SP1 sets out to remove.
3. **The navbar band is dead space** — reserved even though the chrome collapses to almost nothing.

### 1.3 The obstacle, and the answer

Floating chrome needs a layer that *is* chrome: its own `WebContentsView`, added above the tab
views, kept exactly as tall as the chrome currently is, with a transparent background, forwarding
input to the page underneath wherever it is not itself painted. Main decides when it is open, from
pointer positions reported by whichever layer the pointer is over; the chrome layer never decides
for itself.

That answer was chosen in a throwaway design spike (three candidate rigs, pixel-probed under a live
session). **The spike directory was later deleted by system temp cleanup; its surviving findings
are recorded in §1.4 so none of it has to be re-learned.**

The rule that follows for every future surface: **a chrome surface either fits inside the chrome
box at the top of the window, or it becomes a layer of its own.** Nothing expands the chrome box.

### 1.4 What the design spike established

| Question | Finding |
| --- | --- |
| Chrome above tab views | Works. The chrome layer's bounds must stay tight (12 px collapsed / ≈78 px open with the defaults); the page keeps every pixel outside that box |
| Reveal from pointer position | Works from the reports of whichever layer is under the pointer; the frame band needs no extra pixels of its own |
| Drag regions (`-webkit-app-region: drag`) | Deliver hover but **swallow presses** — every interactive control must opt out |
| Wheel over the frame | **Not verified** before the spike was deleted. Hover is delivered over drag regions and the wheel handler is an ordinary DOM listener, so it is expected to work — M2 verifies it |
| Window top corners | Transparent window + radius carried by the frame; pixel-verified; the cutouts drop input |
| Page top corners | Painted *by the page* (two fixed fillets with a 1 px hairline, transparent inside the arc); pixel-verified at 0/12/25 px, including proof that 25 was applied rather than clamped |
| The page radius has no cap | The arc's top end is a point on the page's top edge at any radius; an earlier `min(r, frame height)` cap was a bug and was removed. The **window's** radius remains genuinely capped by the frame's height |
| `webContents.sendInputEvent` | Needs a **focused window**; without it every injected event is dropped |
| Injected wheel | `sendInputEvent`'s wheel never scrolls (0 px); CDP `Input.dispatchMouseEvent` does, and also needs focus |
| Wayland | `screen.getCursorScreenPoint()` returns `0,0`; `win.setPosition` is a no-op or unreliable; the window's size is not reliably controllable — tests must assert relative geometry, never absolute positions |

### 1.5 Terminology

- **Frame** — the 12 px bar at the very top of the window; the titlebar.
- **Strip** — the frame's row of pills; the collapsed chrome.
- **Pills** — one small rounded chip per tab, in tab order.
- **Island** — the strip grown: tab pills + address pill + controls, fully rounded.
- **Cards** — the strip grown by Ctrl+Tab: one card per tab, favicon + title.
- **Chrome box** — the region the chrome layer occupies (12 px collapsed; taller when open).
- **Chrome layer** — the `WebContentsView` that draws the frame, strip, island and cards.
- **Tab views** — the per-tab `WebContentsView`s that render pages.
- **Page fillet** — the page's own rounded top corner.

---

## 2. Goal, non-goals, success criteria

### 2.1 Goal

Mercury's chrome: a distinctive, fully restylable UI in which the viewport is the window minus a
12 px frame; the chrome collapses into that frame and grows into the island on intent; nothing else
about the browser is on screen until it is asked for.

### 2.2 Non-goals

Explicitly out of scope for SP1:

- Content blocking / uBlock-grade filtering (SP2), memory management (SP3), data import (SP4).
- Auto-updating and release feeds.
- macOS and Windows fidelity. The design must not *forbid* them, but only Linux is built now.
- Migrating surfaces that must cover the page but are not the chrome: modals, find-in-page, the
  download bar, the task overlay, prompts. They keep today's mechanisms; §1.3 states the rule for
  when they move.
- A theme gallery or marketplace — sharing is a file, nothing more.

### 2.3 Success criteria

Each criterion is mechanically checkable.

| ID | Criterion |
| --- | --- |
| SC1 | Window and page corners match the verified pixel signature, and the page radius follows its setting 0–100 live |
| SC2 | The island is summoned from the frame band (plus the configured tolerance) only: with the tolerance at its default 0, a pointer over the page's first rows never opens it; it survives the corridor and closes after the grace |
| SC3 | The tab view's viewport begins exactly at the frame's bottom edge — no page pixels under the frame, none missing below it |
| SC4 | With the chrome retracted, the page below the frame receives pointer input unchanged: no dead band, no swallowed clicks |
| SC5 | The strip switches tabs; with more pills than fit, the row scrolls by wheel and by drag, and the empty frame still drags the window |
| SC6 | Ctrl+Tab shows the card row, cycles in row order (Shift reversed), never exceeds the chrome box, and commits on release |
| SC7 | Address editing hides nothing: during an edit, no tab view is hidden and no screenshot placeholder is requested |
| SC8 | The overview opens from the island's button and from Ctrl+Shift+A as a searchable list of tabs grouped by task; choosing a tab focuses it |
| SC9 | The new settings apply live: page radius, hover tolerance, pinned chrome |
| SC10 | A theme file changes the chrome through tokens; an invalid theme is rejected with the default left in place; safe mode loads defaults |
| SC11 | SP0's suite stays green: identity, localization, packaging, and the existing end-to-end tests |

---

## 3. Decisions

| # | Decision | Choice | Rationale |
| --- | --- | --- | --- |
| 1 | The chrome's layer | Its own `WebContentsView` above the tab views, sized to the chrome | The only arrangement in which DOM chrome floats over live content without hiding the page; validated against alternatives in the spike |
| 2 | The viewport | Window minus the frame; tab views begin at the frame's bottom edge | The frame is real estate; the page's first pixels are never under chrome |
| 3 | Collapsed chrome | The strip: one pill per tab, in tab order, nothing else | The maintainer's rule: the strip shows nothing but small pills that represent the tabs |
| 4 | The strip's role | A control as well as a display: click switches, nothing squeezes, overflow scrolls | Equal chips stay readable where shrinking to noise would not; a strip you can scroll beats one that lies about how many tabs exist |
| 5 | A press on a pill | Scrolls the row; it does not drag the window. The rest of the frame drags it | Dragging is the natural gesture for a scrollable row, and the row is only as wide as its pills, so the frame keeps a large drag area |
| 6 | Expanded chrome | The island: the same element morphed, one row of tab pills + address pill + controls | One surface, one place to look; preserves the no-second-omnibox invariant |
| 7 | Hiding | Auto-hide by default; pin means in-flow + viewport inset | Chrome appears on intent; users who want it always pay with a shorter viewport, not an overlay |
| 8 | Who decides reveal | Main, from pointer reports of whichever layer is under the pointer | The chrome layer is too small to detect its own summons; one owner of the geometry keeps the layers in agreement |
| 9 | The hidden zone | The frame itself; tolerance 0–24 px, default 0 | The maintainer's rule: the hovering zone is the strip, not the band below it. Tolerance is a setting for a bigger target |
| 10 | The hold region | A corridor from the frame to the island's bottom + 8 px; close after a 160 ms grace | A pointer travelling to the island must not dismiss it on the way |
| 11 | Window corners | Top 12 px, fixed, not a setting; bottom square | The 12 px is a design constant; native views cannot be clipped, so the bottom cannot be rounded |
| 12 | Page corners | Painted by the page; a setting 0–100, default 20, live, no cap | Nothing covers the page and no input is redirected; the radius can be anything because the arc lives inside the page |
| 13 | Ctrl+Tab | The strip grows into cards (favicon + title) and commits on release | The strip is the tab surface; a transient card row is that surface showing where you are going, without a third overlay |
| 14 | Accent | The page's colour reaches only the active pill, the address pill, the focus ring and the selected suggestion; otherwise the theme's neutrals | Colour identifies the page you are on without turning the chrome into a paint set |
| 15 | Editing | In place in the island; no view hidden, no screenshot placeholder | Removes Min's freeze (`requestPlaceholder('editMode')`) rather than restyling it |
| 16 | Themes | Data (token values), not CSS; validated; `--safe-mode` escape hatch | Shareable by construction, and a shared browser theme must not be executable code |
| 17 | Dark appearance | AMOLED black frame, lifted island: the frame is true `#000`; the island is a surface a step off it, with its own border and shadow | On OLED the window's own edge dissolves into the display, while the island stays an object over the page rather than a hole in the frame (§4.8) |
| 18 | The overview's shortcut | Ctrl+Shift+A, command `showTabOverview` | Chrome and Edge use it for tab search, it is free in the current keymap, and it is distinct from Ctrl+Tab's card cycling |

---

## 4. Detailed design

### 4.1 Surfaces and layering

- **The window** is a `BaseWindow`, frameless, transparent, with a transparent background and the
  existing minimum sizes. Its top corners are the frame's; its bottom corners are square.
- **Layers, bottom to top:**
  1. `mainView` — today's UI page (`index.html`). Keeps every surface not yet migrated (modals,
     find bar, download bar, task overlay, prompts, places).
  2. **Tab views** — one per tab (`main/viewManager.js`); bounds
     `{ x: 0, y: frameH, width: w, height: h − frameH }`.
  3. **The chrome layer** — a new page; bounds `{ x: 0, y: 0, width: w, height: chromeBoxH }`;
     transparent; the only surface that floats over content in SP1.
- **`chromeBoxH`** (defaults): collapsed `12`; island `12 + 12 + ≈53` ≈ 78; cards
  `12 + 12 + 40` = 64. Main computes it (§4.6) and pushes it to the chrome layer.
- **Input.** The chrome layer is a native view: it has no pass-through. Within its bounds, anything
  that is not chrome forwards `mousedown` / `mouseup` / `wheel` to the active tab view at the same
  coordinates — the gaps beside the island, the area under an open island where the page shows, and
  the transparent corner cutouts of its rounded boxes. Main owns that forwarding, so there is one
  implementation.
- **The rule:** a chrome surface either fits in the chrome box, or it becomes a layer of its own.
  Nothing ever expands the chrome box.

### 4.2 The frame (titlebar)

- Flush to `y = 0`; height `--strip-h`, default 12 px (a token, not a setting; the spike exercised
  6/12/20).
- Background `--frame-bg`, with a 1 px `--hairline` along its bottom edge, gapped by `--r-page` at
  each end so it meets the page's fillet arc without a corner.
- Top corners `--r-window`, fixed at 12 px; the window is transparent behind them.
- Drag: the whole frame drags the window; pills and every other control are `no-drag`. Accepted
  cost: the top edge cannot be a window-resize handle.
- Content: **only pills.** No text, no icons, no title.
- Titlebar behaviours: double-clicking the strip toggles maximise (on the frame itself; a
  double-click on a pill is not a maximise gesture). **Not buildable as stated on Linux:** the spike
  (§1.4) measured that a drag region swallows presses, so the page never sees a double-click on the
  frame, and a `no-drag` frame would stop dragging the window. The gesture therefore only arrives
  where the window manager gives a drag region native caption behaviour; the island's maximise
  button is the reliable path, and the gesture's fate is an M3/M4 decision, not M1's. No custom
  system menu is drawn; the island carries the window controls.

### 4.3 The strip (pills)

- One pill per tab, in tab order. In the **frame** a pill is state, not a tab bar: no titles, no
  icons — width and colour carry the meaning. In the **island** a pill names its page: a dot in the
  page's own colour and the page's registrable domain beside it, the way the layering spike's did
  (2026-10-21, §4.3 amendment). The island is a black bar with the content floating in it, so an
  island's pill paints nothing of its own: the frame's bar is the frame's drawing, and the island's
  own pill carries no background but the active one's faint tint of the page's own colour.
- Sizes (tokens): `--pill-w` 26 px, `--pill-active-w` 38 px, drawn height
  `clamp(3px, --strip-h − 8px, 12px)`, `--strip-gap` 4 px, `--strip-pad` 6 px. Each pill's **hit
  box** is the frame's full height — a 4 px drag target is not a target. Inside the island the pills
  take `--pill-h-island` (M1: 36 px, the address pill's height, so the island's row is one row of
  equal-height pills): the drawn-height formula is the frame's, and the island's height is a
  separate token so a theme can set the two states apart.
- Alignment: `--strip-align`, default `safe center`. When the row fits, it is centred; `safe` keeps
  the row's start reachable once it overflows.
- **No shrinking.** Pills keep their widths; a row that does not fit scrolls.
- **Wheel** over the strip band scrolls the row horizontally.
- **Drag**: pressing a pill and moving ≥ 4 px scrolls the row; the click that would have followed is
  suppressed. Below the threshold it is a click → switch tab.
- **Click** a pill → switch. **Middle-click** → close its tab. **Right-click** → the existing tab
  context menu (rendered as its own layer whenever it extends below the chrome box).
- **Keep-in-view**: when the row overflows it is positioned so the active pill is centred; when it
  fits, CSS centres the row.
- The empty parts of the frame still drag the window. This is the accepted trade of decision 5:
  where the pills are, a press means the row; everywhere else it means the window.

### 4.4 The island

- The strip **grows into the island**: one element, one row — `[tab pills] [address pill]
  [controls]`.
- **Address pill.** At rest: the active tab's favicon and registrable domain. On hover: the full
  URL. Clicking it (or Ctrl+L) begins in-place editing with the text selected; Enter navigates;
  Escape cancels the edit, a second Escape retracts. A tab with no page has no domain, and the
  pill rests with the locale's name for one (`newTabLabel`) rather than empty (2026-10-21).
- **Suggestions.** Typing grows the island downward into a list; the pill row becomes the list's
  header. The list reaches ≈250 px, scrolls, and is keyboard-navigable. Existing machinery is
  reused — search suggestions, bangs, calculator, bookmarks, history (`js/searchbar/*`).
- **Controls**: back/forward, reload/stop, the overview button, the menu, and the window controls
  (minimise, maximise, close) at the right end. The active tab pill carries its own close control.
- **Notifications**: downloads, permission requests and transient notices appear in the island;
  each has a lifetime; the island opens for them and retracts when they end. (This is the "timed
  events" trigger.)
- **Pinned**: a toggle in the island and in settings. Pinned means in-flow — the tab views start
  below the island, so the viewport is inset and the island is always visible. The suggestion list's
  growth then **overlays** the page rather than pushing it: the viewport must not jump while typing.
- **Retracting**: Escape, the pointer leaving the corridor, window blur, or focus moving into the
  page.

### 4.5 The tab HUD (cards)

- Ctrl+Tab grows the strip into a row of **cards**: one per tab, in tab order; Shift reverses. The
  cards stay expanded for as long as Ctrl is held, and each tap of Tab moves the selection. The
  command already exists (`switchToNextTab`, `js/util/keyMap.js:22`); the cards are its visual.
- A card is **favicon + title**; no thumbnails, nothing captured.
- The selected card is emphasised; the row scrolls to keep the selection centred.
- Releasing Ctrl commits the selection. Escape cancels and returns to the tab you started from
  (**recommendation — veto at review**).
- While the cards are open they are the surface: hovering does not morph to the island.
- Sizes (tokens): card ≈160 × 40 px, gap 6 px — the card state of `chromeBoxH` (12 + 12 + 40 = 64).

### 4.6 Reveal and retract

- **Main owns the state** (`closed`, `open`, `cards`) and the geometry.
- **Pointer reports.** The chrome layer reports pointer positions while the pointer is over it; the
  tab-view preload reports them while the pointer is over a page. Main applies the rules to
  whichever reports arrive and remembers which layer produced the last one.
- **Summon**: a pointer inside the frame band (`y ≤ --strip-h + hoverTolerance`) opens the island.
  `hoverTolerance` is 0–24 px, default 0, a setting. The hidden zone is the frame itself, widened
  downward by the tolerance: at the default 0, the page's first rows never summon the chrome.
- **Hold**: a corridor from the frame down to the island's bottom plus `--keep-margin` (8 px). A
  pointer inside it keeps the island; a pointer leaving it downward, sideways past the island's box,
  or out of the window starts a 160 ms grace timer, cancelled by re-entry.
- **Overshoot**: a pointer that leaves the window while its last report was on the frame keeps the
  island — it is heading for another window or the screen edge, not away from the chrome.
- **Window blur closes it**, and main counts closes by cause (the spike's `status.blurs` pattern), so
  a blur can never be misread as a corridor bug.
- **Keyboard**: Ctrl+L opens and focuses the address; Ctrl+T adds a tab and focuses the address;
  Ctrl+Tab opens the cards; Escape retracts.
- **Geometry ownership**: main computes the box and pushes it to the chrome layer (`setGeom`), so the
  CSS heights and main's hit regions cannot disagree.

### 4.7 Corners

- **Window**: `--r-window` = 12 px fixed on the frame's top corners; not a setting. Bottom corners
  square (native views cannot be clipped). The cutouts are transparent and do not receive clicks.
- **Page**: `--r-page` is a user setting, 0–100 px, default 20, live. The page paints its own
  corners: a preload module (main frame only) appends two `position: fixed` elements to
  `documentElement`. Each is a radial gradient — transparent inside the arc, a 1 px hairline on the
  arc, `--frame-bg` outside it. Styles are set through CSSOM (not injected stylesheets) so page CSP
  cannot block them; `pointer-events: none`; `aria-hidden`; maximum z-index.
- **Delivery**: main sends `pageStyle` (radius + the two colours) to every tab view; the preload
  requests it on `DOMContentLoaded` and re-renders on change; a navigating document re-requests on
  its own `DOMContentLoaded`.
- **Continuity**: the frame's hairline stops `--r-page` short of each end, so hairline and arc meet
  without a corner.
- **Cost**: at radius *r*, each corner masks ≈0.21·*r*² px of the page's own pixels — invisible but
  still clickable (≈84 px² at 20 px; ≈2,100 px² at 100 px).
- **Why not a layer**: nothing covers the page and no input is redirected. An overlay layer would
  intercept clicks meant for the page's corners.

### 4.8 Colour: the accent rule

- All colour is tokens with light and dark values, following the existing `darkThemeIsActive` switch
  (`js/util/theme.js`).
- The built-in dark variant is **AMOLED black**: the *frame's* background is true `#000`, and the
  neutrals and hairline are chosen to stay legible against it. On an OLED panel the window's own
  edge dissolves into the display.
- The island is a **lifted surface** over that frame: its own background (`--island-bg`, `#23252b`
  in the dark variant — a step off the frame, not the same black), a 1 px `--island-border`, and a
  deeper `--island-shadow` (`0 16px 46px` plus `0 2px 8px`) than a plain bar would need. Its radius
  is the **capsule rule** — half the island's height, so the row's ends are semicircles — and the
  chrome box reserves 8 px under it for the shadow to paint in, so the box's own edge never cuts
  that shadow into a hard line.
  *(Maintainer's call, 2026-10-19, after the layering spike was recovered and re-run: with
  `--island-bg` equal to `--frame-bg` the island had no edge at all — a black band, not an
  object — which the spike's surface had and this table had lost.)*
- The page's colour (`js/navbar/tabColor.js`) reaches exactly: the active pill (strip and island),
  the active indicator, the address pill, the focus ring, and the selected suggestion.
- Everything else is neutral chrome. When a page has no colour of its own, the theme's accent is
  used.
- The result: the active tab is findable at a glance, and the chrome stays readable against any
  page.

### 4.9 The overview

- The overview button in the island opens a searchable list of the window's tabs, grouped by task
  (`js/tabState/task.js`). Its default shortcut is **Ctrl+Shift+A** (command `showTabOverview`) —
  Chrome and Edge's tab-search convention, free in the current keymap, and deliberately different
  from Ctrl+Tab, which expands the strip instead. The command and the binding land in M2 with the
  surface.
- It must cover the page, so it is **its own layer** above the chrome layer.
- Search reuses the existing scoring (`quick-score` is already a dependency).
- Choosing a tab focuses it and closes the overview; Escape or a click outside closes it.
- It replaces Min's task overlay's appearance (`js/taskOverlay/*`) while keeping its data.

### 4.10 Settings and themes

- **New settings** (names freeze at the first release; proposals): `pageCornerRadius` (0–100,
  default 20), `hoverTolerance` (0–24, default 0), `pinChrome` (bool, default false), `chromeTheme`
  (theme id or null, default null). **Removed**: `useSeparateTitlebar` — the frame is always ours.
- **Live application**: a setting change goes through the existing broadcaster
  (`js/util/settings/settingsMain.js`, `settingChanged`) to main, which pushes tokens/geometry to the
  chrome layer and `pageStyle` to every tab view.
- **Tokens** are the public contract: `--frame-bg`, `--hairline`, `--pill`, `--text`, `--accent`,
  `--strip-h`, `--strip-align`, `--r-window`, `--r-page`, `--pill-w`, `--pill-active-w`,
  `--island-gap`, `--island-h`, and the motion timings of §4.12. The chrome's appearance is fully
  described by them.
- **Themes are data, not CSS.** **Recommendation — veto at review:** a theme is a JSON file —
  `{ "name", "author", "version", "tokens": { … }, "variants": { "light": { … }, "dark": { … } } }` —
  loaded from `userData/themes`, imported through the settings page, shared as the file itself.
  Unknown keys are ignored; invalid values reject the theme rather than partially applying it.
  Applying a theme sets tokens on the chrome layer and pushes the page-facing colours to every view.
- **Why not CSS:** a shared theme is attacker-controlled code the moment it can run CSS or JS in a
  layer that holds the address bar. Data cannot do that. (CSS themes also break on every internal
  rename; tokens do not.)
- **Safe mode:** launching with `--safe-mode` (or `MERCURY_SAFE_MODE=1`) ignores user settings and
  themes for the session and loads the built-in defaults. Because themes are validated data, a bad
  theme cannot brick the browser; the settings page also offers "reset appearance".

### 4.11 First run and empty states

- The new tab page is redesigned (M4) to explain the product on first run: the gestures (hover the
  top edge, Ctrl+L, Ctrl+T, Ctrl+Tab, dragging the frame), the corner setting, and where themes
  live.
- The first tab opens with the island **retracted** — the page explains itself instead of the
  chrome opening a tour. (SP0 removed Min's tour; this replaces it with a page that *is* the
  product.)
- Later Ctrl+T focuses the address pill; Ctrl+T on a fresh profile does not — there is nothing to
  teach twice.
- The new tab page is a tab's empty state; there is no second onboarding surface.

### 4.12 Motion

**Recommendation — veto at review.** Every value is a token; nothing hardcodes a duration.

| Token | Value | Applies to |
| --- | --- | --- |
| `--t-reveal` | 140 ms ease-out | strip → island, strip → cards, suggestion-list growth |
| `--t-retract` | 120 ms ease-in | island/cards → strip |
| `--close-grace` | 160 ms | the delay before retracting once the pointer leaves the corridor |
| reveal on hover | immediate, no delay | the frame at the screen edge is a deliberate target; a delay would only add lag |
| `prefers-reduced-motion: reduce` | 0 ms | all of the above |

### 4.13 Closing a window whose chrome is hidden

**Recommendation — veto at review.**

- With the chrome retracted, the mouse path is: hover the frame → island → close. That is a
  deliberate design (the controls live with everything else), and a discoverability debt.
- Keyboard is the fast path and already exists: `closeWindow` (Ctrl+Shift+W) and `quitMercury`
  (Ctrl+Q), defined in `js/util/keyMap.js`. The OS's close (Alt+F4, the taskbar) is unchanged.
- The first-run new tab page names the keyboard path, because a close control you must summon is
  worth documenting.
- SP1 adds exactly one shortcut — the overview's Ctrl+Shift+A (§4.9) — and renames the quit command
  off Min's name: `quitMin` becomes `quitMercury` (`js/util/keyMap.js`, `js/defaultKeybindings.js`,
  `main/menu.js`). Nothing has shipped, so no settings migration is owed.

### 4.14 The fate of existing modules

| Module | Fate in SP1 |
| --- | --- |
| `main/main.js` window options | `frame: false` and `transparent: true` always; `useSeparateTitlebar` removed |
| `main/viewManager.js` | Same role; view bounds begin at the frame's bottom; the chrome layer is managed alongside |
| `index.html` navbar/searchbar markup | **Covered** by the views in M1 — unreachable but not deleted, because ~15 modules anchor to it; removed in M3, when the machinery it anchors moves into the island |
| `js/navbar/tabBar.js` | Replaced by the strip's row |
| `js/navbar/tabEditor.js` | Replaced by the island's address pill; unreachable in M1, retires in M3, when its `requestPlaceholder('editMode')` path retires |
| `js/searchbar/*` | UI replaced; the plugin machinery (suggestions, bangs, calculator, bookmarks, history) reused inside the island |
| `js/navbar/navigationButtons.js`, `progressBar.js`, `bookmarkStar.js`, `menuButton.js`, `contentBlockingToggle.js`, `permissionRequests.js` | Reused as controls inside the island |
| `js/navbar/tabColor.js` | Reused unchanged — the accent rule's source |
| `js/navbar/tabContextMenu.js` | Reused — right-click on pills |
| `js/navbar/tabActivity.js`, `js/tabAudio.js` | Reused; how a pill signals audio is an M2 detail |
| `js/taskOverlay/*` | The basis for the overview layer (M2) |
| `js/webviews.js` placeholder machinery | Stays for surfaces that still use it; no SP1 chrome surface uses it |
| `js/windowControls.js`, `css/windowControls.css` | Replaced by the island's controls |
| `js/defaultKeybindings.js` | Gains the overview command (M2); `quitMin` renamed to `quitMercury` |
| `js/util/keyMap.js` | `quitMin` → `quitMercury`; gains `showTabOverview` (Ctrl+Shift+A) in M2 |
| `js/util/theme.js` | Kept; the chrome tokens follow the same light/dark switch |

---

## 5. Milestones

| Milestone | Content | Exit criteria |
| --- | --- | --- |
| **M1 — Chrome shell** | Frameless, transparent window; the chrome layer above the views; the frame and the strip rendering the real tabs as pills; the address pill editing (type / Enter / Escape) and navigating; navigation and window controls in the island's row; tab views starting at the frame's bottom; `pageCornerRadius` and `hoverTolerance` plumbed as live settings | SC1, SC3, SC4, SC9 (radius, tolerance) |
| **M2 — Tabs and overview** | Strip interactions (switch, scroll, drag, keep-in-view); the overview layer (search, task groups); pinned mode and the viewport inset | SC5, SC8, SC9 (pin) |
| **M3 — Island as a surface, no freeze** | The morph; suggestions inside the island; notifications; Ctrl+L / Ctrl+T / Ctrl+Tab and the cards; Escape semantics; editing proven to hide nothing | SC2, SC6, SC7 |
| **M4 — First impressions** | The new tab page that explains the product; theme loading, import and safe mode; motion and polish | SC10 |

M1's address pill is deliberately basic (type and Enter, no suggestions). The browser must never be
without a URL editor, which is what forces editing into M1 rather than M3 — and the old navbar and
the new chrome cannot both own the top band, so the plan must sequence that swap without a commit
that leaves no way to type an address.

---

## 6. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | Wayland geometry: no cursor position, unreliable window positioning | The design never depends on either; tests assert relative geometry only (§1.4) |
| R2 | Transparency needs a compositing window manager | Without one, fall back to square corners; never fail to start |
| R3 | Page fillets can be misplaced by rare pages (transforms on `html`/`body`) | They are cosmetic and pointer-transparent; the page works either way |
| R4 | Forwarded input needs a focused window (measured) | Real use has focus; tests focus explicitly before injecting |
| R5 | Drag regions swallow presses | Every interactive control opts out; a missed one shows as a control that hovers but cannot be clicked — checked by eye in review and by the click tests |
| R6 | A premature close while the pointer travels to the island | Geometry + grace, with closes counted by cause so failures are diagnosable |
| R7 | Editing focus in a layer whose height changes | Open the box before focusing, or the caret clips |
| R8 | One more `WebContentsView` per window | The chrome page idles when retracted: no animation loops, no timers |
| R9 | Sequenced removal: two chromes cannot share the top band | The plan sequences M1 so a URL editor exists at every commit |

---

## 7. Verification plan

**Unit** (`npm run test:unit`, `node --test`): the geometry as pure functions — hidden zone,
corridor, grace, keep-in-view centring; the clamps for radius and tolerance; theme validation
(valid, unknown keys, invalid values). No DOM.

**End-to-end** (`npm run test:e2e`, Playwright and the existing harness in `test/e2e/`):

- **Pixel probes** on `capturePage()` for SC1 and SC3: the window's top corners, the page's top
  corners at 0/20/100 px, the hairline's continuity with the arc, and the viewport's offset from the
  window's top edge.
- **Injected input** for SC2, SC5 and SC6, with `win.focus()` as an explicit precondition, and CDP
  for wheel (measured: `sendInputEvent`'s wheel is not delivered).
- **DOM assertions** for SC7 (`placeholderRequests` stays empty during an edit), SC8, SC9, and SC10
  (a theme file round-trip, including a deliberately invalid one).

**Manual**: look and feel — the motion, and the corridor by hand on a real session, as the spike was
run. This is where the two unverifiable-by-test claims live: that it feels responsive, and that it
does not obstruct.

**CI**: the existing workflows; the end-to-end suite runs there as it does today.

---

## 8. Accepted gaps and follow-ups

- The window's bottom corners are square: native views cannot be clipped.
- The window's corner cutouts drop input (≈70 px² each at 12 px).
- The visually masked page arcs remain clickable (≈84 px² per corner at 20 px, ≈2,100 px² at 100 px).
- No top-edge window resize: the frame is the drag region.
- While the island is open, page content under the chrome box receives forwarded clicks and wheels
  but not hover — a native view above the page has no pass-through. Main already receives every
  pointer position, so forwarding movement as well is the follow-up if hover under an open island
  turns out to matter.
- Modals, find-in-page, the download bar, the task overlay and prompts keep today's mechanisms;
  migrating them to the §1.3 rule is follow-up work, not SP1.
- macOS and Windows are designed for but not built: traffic lights, window controls, transparency
  and corner behaviour will need per-platform work.
- No theme gallery; sharing a theme means sharing a file.
- The design spike is deleted; §1.4 is its surviving record.
