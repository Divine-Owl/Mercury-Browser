# Mercury — Identity & Foundation (Sub-project 0)

**Date:** 2026-10-18
**Status:** Design approved; pending spec review
**Sub-project:** 0 of 5
**Depends on:** nothing
**Blocks:** all other sub-projects

---

## 1. Context

Mercury is a hard fork of [Min](https://github.com/minbrowser/min) at **v1.35.7**, intended as a
differentiated browser product distributed to other people. Scope is **Linux first**, with other
platforms deferred.

### 1.1 Reference artifact

This design is grounded in the installed artifact, not in assumptions about it.

| Fact | Observed value |
| --- | --- |
| Application | Min `1.35.7` |
| Engine | Electron `43.7.9` (Chromium-based) |
| Launcher | `/usr/bin/min` — a bash script: `exec electron43 /usr/lib/min/app "$@"` |
| Payload | `/usr/lib/min/app` — **unpacked directory, not an ASAR** |
| User data directory | `~/.config/Min` |
| Custom scheme | `min://` (registered `--standard-schemes=min --secure-schemes=min --fetch-schemes=min`) |
| Provenance | AUR package `min` `1.35.7-1` builds from `github.com/minbrowser/min/archive/v1.35.7.tar.gz` (sha256 `93b4a2fcd715669ea15672d46d8e7f7f1e52bba485fa68c1f0dca8852a4561ed`) |
| Upstream licence | `Apache-2.0` |
| Upstream activity | ~4 releases/year; default branch `master`; actively maintained |

Because Min ships unminified upstream source and the installed tree matches upstream, every claim
below is checkable against either the shipped artifact or upstream source at tag `v1.35.7`.

### 1.2 Why identity comes first

Until identity is severed, running a Mercury build:

- writes to `~/.config/Min`, colliding with a real Min installation and its singleton lock;
- registers the `min://` scheme;
- **uploads usage statistics to `minbrowser.org`** (`js/statistics.js` is enabled unless the user
  explicitly sets `collectUsageStats: false`).

Every test run would therefore be both a collision and a data leak. This sub-project is small, and
it is the precondition for testing anything else safely.

---

## 2. Goal, non-goals, success criteria

### 2.1 Goal

Mercury is a distinct, installable Linux application that never touches Min's installation, data,
or infrastructure, and that can run concurrently with Min.

### 2.2 Non-goals

Explicitly deferred to later sub-projects:

- UI theming, design tokens, customization surface (SP1)
- Content blocking / uBlock-grade filtering (SP2)
- Memory management (SP3)
- Browser data import (SP4)
- Auto-update (download and install)
- Windows and macOS packaging

### 2.3 Success criteria

Each criterion is mechanically checkable.

| ID | Criterion |
| --- | --- |
| SC1 | While Mercury is running, it makes **zero** connections to any `minbrowser.org` host |
| SC2 | `~/.config/Mercury` is created; `~/.config/Min` is neither read nor written |
| SC3 | Min and Mercury run **simultaneously** without a singleton-lock collision |
| SC4 | The desktop environment reports application ID `org.mercury.Browser`, with the Mercury icon |
| SC5 | `mercury://` pages render correctly (settings, new tab, reader) |
| SC6 | Regression pass: new tab page, reader view, places search, bookmarks |

---

## 3. Decisions

| # | Decision | Choice | Rationale |
| --- | --- | --- | --- |
| 1 | Identity bundle | Display **Mercury**; binary and package **`mercury-browser`**; scheme **`mercury://`**; desktop ID **`org.mercury.Browser`** | `mercury` alone risks a `$PATH` collision with unrelated packages of that name |
| 2 | Usage statistics | **Removed entirely** — upload code, setting, and UI toggle | Near-zero engineering cost; "sends nothing" is a verifiable claim, whereas "opt-in anonymous stats" is strictly weaker and carries permanent policy obligations |
| 3 | Linux distribution | **AppImage + deb + rpm** | Reuses Min's three existing build scripts; deb/rpm users get updates via apt/dnf, AppImage users via a future notifier |
| 4 | Electron runtime | **Bundled** | Deterministic behaviour across distros, and engine security fixes can ship immediately rather than waiting on a distro |
| 5 | Localization | **All 35 locales rebranded** | Because "Min" is a proper noun in the affected strings, this is a name substitution, not a translation task — see §4.4 |
| 6 | Repository | **Fresh repo**, single import commit of Min v1.35.7 | Chosen for a clean history; the upstream hedge in §4.6 compensates |
| 7 | Update feed | **Disabled** for v0.1 | No releases to advertise yet; the feed returns when there is something to announce |

---

## 4. Detailed design

### 4.1 Identity model

Three distinct things are easy to conflate, and they are configured in two different places.

| Thing | Mechanism | Effect |
| --- | --- | --- |
| Application name | `productName` in `package.json` | Electron derives `app.getName()` from it, therefore `app.getPath('userData')` |
| Desktop identity | `desktopName` in `package.json` | Wayland `app_id`, X11 `WM_CLASS`, window grouping, icon matching, and portal identity |
| URL scheme | `mercury://` everywhere | Internal pages, preloads, session restore |

`package.json` changes:

```json
{
  "name": "mercury-browser",
  "productName": "Mercury",
  "desktopName": "org.mercury.Browser",
  "version": "0.1.0"
}
```

Using `package.json` fields rather than runtime calls (`app.setName()`, `app.setDesktopName()`)
removes an ordering hazard: those calls must run before the `ready` event, and a late call silently
fails to affect paths. This is confirmed empirically — Min's own `productName: "Min"` is exactly why
its directory is `~/.config/Min`, not `~/.config/min`.

**Version starts at `0.1.0`** so any future update check cannot compare Mercury against Min's version
line.

**Resolved — the mechanism is known.** `app.setDesktopName(name)`, and the equivalent
`desktopName` field in `package.json`, sets the XDG application ID (`app_id`) on Wayland and
`WM_CLASS` on X11, and *must match the base filename of the app's installed `.desktop` file*.
`setDesktopName` is present in the Electron 43.7.9 binary, so the API exists in the version being
bundled, and the `package.json` field is documented as equivalent.

electron-builder installs the `.desktop` file as `org.mercury.Browser.desktop` (and writes a matching
`StartupWMClass`) only when **both** `desktopName` is set in `package.json` **and**
`linux.syncDesktopName` is true — and only from **electron-builder 26.17.0**. Min pins `^24.13.3`,
which has `getDesktopFileName` but reads `desktopName` nowhere. Section 4.5 therefore bumps
electron-builder. No post-processing of the package is required.

### 4.2 Infrastructure severance

Complete list of Min-owned endpoints found in the artifact, with the action for each.

| Surface | Location | Current value | Action |
| --- | --- | --- | --- |
| Usage statistics | `js/statistics.js` | `POST https://services.minbrowser.org/stats/v1/collect` | **Delete the module** and all 8 call sites (`browserUI`, `default`, `newTabPage`, `pageTranslations`, `passwordManager`, `sessionRestore`, `userscripts`); delete the `collectUsageStats` setting and its settings-page toggle. The blocked-request counter is unaffected — it reads `#content-blocking-blocked-requests`, not `statistics.js` |
| Update feed | `js/searchbar/updateNotifications.js` | `UPDATE_URL = 'https://minbrowser.org/min/updates/latestVersion.json'` | **Disable** (decision 7) |
| Survey | `js/sessionRestore.js` | `https://minbrowser.org/survey/survey15.json` | **Delete** — already inside a commented-out block, so this is dead-code removal |
| Tour | `js/sessionRestore.js`, main process | `https://minbrowser.github.io/min/tour` (first run, **live**) and `.../tour/` (Help menu) | **Delete** — first run opens a new tab instead |
| Page translation models | `pages/translateService/translateService.js` | `https://services.minbrowser.org/bergamot-models-v1/registry.json` and `.../bergamot-models-v1` | **Disable the feature** in v0.1 — remove the Translate context-menu entry (`js/webviewMenu.js`) so the service is unreachable. The one remaining *live*, user-initiated Min-hosted dependency; see §7 |
| Crash reporting | main process (`main.build.js:1044`; upstream `main/main.js`) | `crashReporter.start({ submitURL: 'https://minbrowser.org/', uploadToServer: false, compress: true })` | Repoint `submitURL`; crashes are not uploaded today, so this is housekeeping, not a leak |
| Support and help links | 32 references across `js/`, plus localization `unsafeHTML` | `github.com/minbrowser/min` (issues, wiki, `docs/statistics.md`) | Repoint to the Mercury repository or remove |
| Search / instant answers | `js/` | `duckduckgo.com`, `ac.duckduckgo.com` | **Keep** — these are features, not vendor infrastructure |

Note on the crash reporter: `uploadToServer: false` means Min does **not** upload crash reports. The
`submitURL` is Min's, so it must still be repointed, but no user data is currently leaving the
machine via this path. (An earlier verbal characterisation in this project suggested otherwise; the
source contradicts it and the source is authoritative.)

### 4.3 Custom scheme rename

`min://` occurs in **12 files, ~20 sites**:

```
js/navbar/tabBar.js
js/navbar/tabEditor.js
js/pdfViewer.js
js/places/tagIndex.js
js/preload/default.js
js/readerView.js
js/searchbar/customBangs.js
js/sessionRestore.js
js/util/settings/settingsPreload.js
js/util/urlParser.js
js/webviews.js
main            (scheme registration; upstream module main/minInternalProtocol.js)
```

The rename must cover:

1. The privileged/standard/secure/fetch scheme registration in the main process.
2. The protocol handler and the internal-protocol module (upstream `main/minInternalProtocol.js`,
   to be renamed `mercuryInternalProtocol.js`).
3. Every referring site above.

**Known risk — see R1.** Two of the twelve are **preload scripts**
(`js/util/settings/settingsPreload.js`, `js/preload/default.js`). A mismatch there does not throw a
visible error; it produces a blank or non-functional settings page. This rename therefore requires
an explicit functional test, not a source grep. `js/util/urlParser.js` is the shared parser and is
the single most likely place for a missed site.

### 4.4 Localization rebrand

Measured against the shipped bundles:

| Pattern | Count | Meaning |
| --- | --- | --- |
| `%n` — application-name placeholder | **205** | Strings such as "About %n", "Quit %n". **Free**: substituted at the *call site* — `l('appMenuQuit').replace('%n', app.name)` — so the rename needs no edit at these sites |
| `%p` — password-manager placeholder | 117 | Unrelated to this sub-project |
| Literal `Min` in `dist/localization.build.js` | **258** | Hardcoded prose — about 7 per locale on average, up to 10 where a locale is fully translated |
| Literal `Min` in `main.build.js` | 295 | Inlined languages object plus main-process strings |

The hardcoded occurrences are almost entirely **prose**, concentrated in error pages — for example
the Japanese locale contains `"serverNotFoundSubtitle": "Minはこのウェブサイトを見つけることができませんでした。"`,
`"sslErrorMessage"`, `"genericConnectionFail"`, `"sslTimeErrorMessage"`.

Because "Min" appears as a **proper noun in subject position**, replacing it with "Mercury" is a
name substitution rather than a re-translation. Grammar is not affected, which is why rebranding all
35 locales is cheaper than it first appears.

Implementation requirements:

- Edit the **sources** — `localization/languages/*.json` (35 files) — and rebuild via
  `scripts/buildLocalization.js`. **Do not** edit `dist/localization.build.js` or
  `main.build.js`; those are generated output and edits would be overwritten.
- Also rebrand main-process strings that name the product in plain code, including the version
  output in the main process (`console.log('Min: ' + app.getVersion())`), which is user-visible
  via `--version`.
- Repoint localization `unsafeHTML` links that point at Min's repository or documentation.

Validation (see §6): every locale file must parse as JSON, and the count of the literal word `Min`
in the built bundles must be **0**.

### 4.5 Packaging and distribution

- **Bundle Electron.** Set `electronVersion` in `package.json` and ship the runtime. Min pins
  `43.4.1` while the installed distro runtime is `43.7.9`.
- **Reuse Min's build scripts**: `scripts/buildLinux.js`, `buildAppImage.js`, `buildDebian.js`,
  `buildRedhat.js`, `createPackage.js`.
- **Bump `electron-builder` from `^24.13.3` to `^26.17.0`.** Required for `desktopName` support
  (§4.1). This is a two-major-version jump and is one of the larger mechanical changes in this
  sub-project; `createPackage.js` also needs its `afterPack` fuse-flip path corrected, because it
  recomputes the executable name from `productName` instead of reading the configured one.
- Because Electron is bundled, the distro-side version substitution used by Min's AUR recipe
  (`@ELECTRON_DIST@` / `@ELECTRON_VERSION@` patching of `createPackage.js`) is **not** needed.
- **Artifact naming:** package `mercury-browser`, binary `mercury-browser`, desktop file
  `org.mercury.Browser.desktop`. The `.desktop` basename **must** equal `desktopName`, or portal
  identity and window grouping break. The shared Linux identity options (executable name,
  `syncDesktopName`, icon, category, MIME types) live in one module rather than being repeated in
  each of the three packaging scripts, because a desync there fails silently at runtime.
- Package `description` and `synopsis` are **rewritten**, not renamed: Min's copy advertises
  DuckDuckGo instant answers and Min's feature set, which is not Mercury's.
- Rebrand `resources/postinst_script` and `resources/prerm_script` (`/opt/Min/min`,
  `min.desktop`, `/usr/bin/min`, the `x-www-browser` alternative).
- Rebrand application icons (`icons/icon256.png`, `icon.icns`, `icon.ico`, and the icon font).

### 4.6 Repository setup and upstream hedge

- Fresh repository; a single commit importing Min v1.35.7 from the upstream tarball
  (sha256 `93b4a2fcd715669ea15672d46d8e7f7f1e52bba485fa68c1f0dca8852a4561ed`).
- Retain a local read-only copy of upstream (`git remote add upstream
  https://github.com/minbrowser/min`, used for `fetch` only, never merged).
- **Hedge process:** on each upstream release, obtain the patch with
  `https://github.com/minbrowser/min/compare/v1.35.7...v1.35.8.diff`, review it for
  security-relevant changes, and `git apply` those selectively.
- **Cadence: monthly.** Because a fresh repository has no upstream history, this check cannot happen
  incidentally — it must be a scheduled, deliberate action. This is the accepted cost of decision 6.

### 4.7 Update path

The update check is **disabled for v0.1** (decision 7). Consequences:

- deb/rpm users receive updates through their package manager. No action required.
- **AppImage users receive no notification of new releases**, including security releases. This is
  an accepted gap for v0.1 and is revisited when the first release is published.

### 4.8 Licensing and attribution

Min is `Apache-2.0`. These are obligations, not choices:

- Retain `LICENSE.txt` unchanged.
- Retain all existing copyright, patent, trademark, and attribution notices.
- Add a `NOTICE` recording that Mercury is a modified fork of Min v1.35.7, the fork date, and a
  description of the modifications.
- Add prominent notices to modified files, as Apache-2.0 §4(b) requires.
- Min's own bundled third-party components (`ext/abp-filter-parser-modified`, `ext/readability-master`,
  `ext/franc`, `ext/xregexp`, `ext/textColor`, `ext/publicSuffixes`) retain their own licences,
  which must continue to ship.

---

## 5. Risks

| ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Scheme rename missed in a preload script | Settings page silently broken — no exception, blank UI | Functional test SC5 is mandatory; `js/util/urlParser.js` reviewed explicitly |
| R2 | 35 locale files edited mechanically | Malformed JSON breaks localization at build or runtime | Build fails loudly; validate with `JSON.parse` over all files (§6) |
| R3 | Bundled Electron | Mercury now owns engine security upgrades, layered on top of the Min fork | Track Electron releases; this is the highest-value patch stream and pairs with the §4.6 process |
| R4 | ~~Electron 43 does not honour `desktopName`~~ — **resolved, §4.1/§4.5** | Wrong `app_id` → broken icon/grouping, portal sessions refused | Electron derives `app_id`/`WM_CLASS` from `desktopName`; electron-builder honours it only with `linux.syncDesktopName` from 26.17.0, so the plan bumps electron-builder. Residual risk is build-time and is caught by the packaging test |
| R5 | Fresh repository has no upstream history | Security fixes are easy to miss | Monthly §4.6 review, treated as a standing task |
| R6 | No update notification for AppImage users | Users run vulnerable versions unknowingly | Accepted for v0.1; re-evaluate at first release |

---

## 6. Verification plan

Static checks (must all pass before dynamic testing):

```bash
# No *functional* reference to Min infrastructure survives.
# Comments are stripped first: ~20 source comments cite upstream issue URLs
# (github.com/minbrowser/min/issues/NNN) that are accurate history and must NOT be
# rewritten. decomment is already a dependency, and is how the localization build
# itself reads these files.
node --test test/no-min-infrastructure.test.js

# Scheme fully renamed, comments excluded
node --test test/scheme.test.js

# All 35 locale files parse. They are JSONC — `/* */` and `//` comments are used
# throughout, so a bare JSON.parse rejects valid files. Strip comments first.
node -e "const d=require('decomment'),fs=require('fs');for(const f of fs.readdirSync('localization/languages')){JSON.parse(d(fs.readFileSync('localization/languages/'+f,'utf8')))};console.log('all locales parse')"

# Product name no longer appears in localized strings.
# -w is load-bearing: without it this matches timeRangeMinutes and appMenuMinimize.
grep -o -w "Min" dist/localization.build.js | wc -l
# expected: 0

# The scheme rename reached the process command line.
# Not on the main process: registerSchemesAsPrivileged appends the switch after the
# process has started, so the main process's own /proc entry never has it. Child
# processes inherit it, so read one of those - or, better, assert it in-process with
# app.commandLine.getSwitchValue('standard-schemes') (see the e2e specs).
pid=$(pgrep -f "electron.*mercury-browser" | tail -1)
grep -o -- "--standard-schemes=[a-z]*" /proc/$pid/cmdline
# expected: --standard-schemes=mercury
```

Dynamic checks, mapped to the success criteria:

| ID | Procedure | Pass condition |
| --- | --- | --- |
| SC1 | `strace -f -e trace=connect -o /tmp/mercury-net.log mercury-browser`, then search the log for any `minbrowser.org` connection | No such connection |
| SC2 | `stat -c %y ~/.config/Min` before and after a Mercury run | Unchanged; `~/.config/Mercury` exists |
| SC3 | Launch Min, then launch Mercury | Both run; no singleton error |
| SC4 | Inspect the compositor's client list for the Mercury window | `app_id` is `org.mercury.Browser`, icon resolves |
| SC5 | Open `mercury://settings` and `mercury://newtab` | Both render and are interactive (validates R1) |
| SC6 | Manual pass: new tab, reader view on an article, places/history search, add and open a bookmark | All function |

SC1 is the criterion that cannot be satisfied by inspection alone, and it is the one that makes the
privacy claim verifiable rather than asserted.

---

## 7. Accepted gaps and follow-ups

**Accepted gaps for v0.1**

1. No in-app update notification (R6), affecting AppImage users specifically.
2. No auto-update; updates are manual or package-manager driven.
3. **Page translation is removed** (decision, §4.2). Min's translation feature downloads Bergamot
   models from `services.minbrowser.org`, which is Min's infrastructure and cannot remain. Mercury
   hosts no model registry, so the feature is withdrawn in v0.1 rather than silently pointed
   elsewhere. Reinstating it means hosting the models or finding a third-party registry.
4. **The first-run tour is removed** and the Help menu no longer links to Min's site, wiki or issue
   tracker. Those links point at the Mercury repository instead; there is no wiki, tour or docs site
   yet, so some Help entries are dropped rather than redirected.

**Open questions carried forward (not blocking this sub-project)**

1. **SP2 — uBlock Origin.** `@gorhill/ubo-core` is `GPL-3.0-or-later`; Apache-2.0 is one-way
   compatible with GPLv3, so linking it would make Mercury GPL-3.0. The alternative is feeding
   uBlock's filter lists into Min's existing engine and remaining Apache-2.0. **Undecided.**
2. **SP1 — "fully customizable UI".** Needs a concrete definition. It spans four different
   projects of very different cost: theme tokens; layout reordering; user CSS injection; and
   arbitrary plugin UI. **Undecided.**
3. **SP3 — memory feature.** Linux levers are confirmed available on the target machine
   (cgroup v2 with a delegated user slice, `memory.high`/`memory.max` present, systemd user manager
   running, zram active with zstd, `vm.swappiness` 150). Design intent is **discard background tab
   renderers first**, with a cgroup soft limit as a safety net — swapping is a weaker lever than
   discarding and hurts perceived responsiveness. Implementation would go through a launcher wrapper
   plus in-app monitoring via `app.getAppMetrics()`.
