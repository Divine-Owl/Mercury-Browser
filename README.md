# Mercury

A web browser for Linux, forked from [Min](https://github.com/minbrowser/min).

Mercury is a **hard fork of Min v1.35.7**. It keeps Min's design — a fast, minimal
browser with a vertical tab strip, tasks, and a search bar that answers questions —
and changes what a fork for other people has to change.

**It collects no usage statistics.** Min's statistics collection, its update feed,
the first-run tour, and page translation have all been removed rather than turned
off, so there is no setting that can re-enable them and no request to a Min-run
server. The claim is greppable and tested: `test/no-min-infrastructure.test.js`
asserts that no functional reference to Min's infrastructure survives in the
source, and `test/e2e/network.spec.js` runs the app behind a recording proxy and
asserts that no request reaches a `minbrowser` host.

## Status

Version 0.1.0, Linux only, and honest about it:

- Packages: `.deb`, `.rpm` and AppImage. The `.deb` is built and verified on every
  CI run; `.rpm` and AppImage are built by a manual workflow and are **not yet
  verified**.
- **No update notification.** deb/rpm users get updates from their package
  manager; AppImage users get none, including for security releases. This is a
  known gap for 0.1 and is revisited at the first release.
- **No code signing**, so the packages are unsigned.
- Mercury runs **alongside** Min without conflict: it keeps its state in
  `~/.config/Mercury` and never reads or writes `~/.config/Min`.

## Building

Node 22 is pinned in `.nvmrc`.

```bash
npm install
npm run build          # buildMain + buildBrowser + buildBrowserStyles + buildPreload
```

`npm run build` must run before the app can start: `package.json`'s `main` is
`main.build.js`, a build artifact, and the preload that the settings page depends
on is concatenated into `dist/preload.js`.

For development, `npm start` builds once and then runs a watcher alongside the
app. Both keep their caches inside the checkout (see `.npmrc` and
`scripts/devEnv.sh`), so removing the checkout removes everything the build
downloaded.

## Packaging

```bash
npm run buildDebian     # dist/app/mercury-browser-<version>-<arch>.deb
npm run buildRedhat     # dist/app/mercury-browser-<version>-<arch>.rpm
npm run buildAppImage   # dist/app/
npm run verifyPackage   # unpack the .deb and check its identity, app id and executable
```

Packaging happens on CI rather than on your machine: `ci.yml` builds the `.deb` and
runs `verifyPackage` against it on every push. `buildRedhat` and `buildAppImage`
are wired into `.github/workflows/build-packages.yml`, which runs on demand, and
neither format is verified yet.

`verifyPackage` unpacks the artifact with `ar` and `tar` (so it needs no
`dpkg-deb`) and checks the things that decide whether an install behaves: the
desktop file's exact name and `StartupWMClass`, the executable it launches, the
registered scheme handler, the installed icon, the package homepage, that the app
carries its `LICENSE.txt` and `NOTICE`, and that the test suite and the local build
caches did not come along.

## Testing

```bash
npm run test:unit       # node --test, unit and source-level assertions
npm run test:lint       # lint, as a baseline diff (see below)
npm run test:e2e        # Playwright drives a real Electron process
```

`npm run test:e2e` launches the built app and asserts on what a user would see: that
`mercury://settings` renders with its settings applied (a stale `min://` guard in a
preload renders a blank page and throws nothing, so this is checked on screen), that
`mercury://` is registered as a standard and secure scheme, that the version banner
says Mercury, that the app writes only to `~/.config/Mercury`, and that nothing
reaches a Min host. It needs a display; on a headless machine use
`xvfb-run -a npm run test:e2e`.

**`npm test` is not the gate, and is informational only.** It runs `standard` over
the tree and reports 643 long-standing errors inherited from Min v1.35.7, including
a hard parse failure — `standard` cannot parse `main/main.js` at all, because the
file uses a top-level `return`. The gate is `npm run test:lint`, which compares each
file's error count against `test/fixtures/lint-baseline.json` and fails only on
regressions.

## Credits

Mercury is a fork of [Min](https://github.com/minbrowser/min) by the Min
contributors, used under the Apache License 2.0. `LICENSE.txt` is Min's licence,
unchanged. See `NOTICE` for the fork's provenance and the full list of
modifications.

## Design documents

`docs/superpowers/specs/` holds the design records — starting with
`2026-10-18-mercury-identity-foundation-design.md`, which defines the identity work
this fork began with: what is renamed, what is removed, and how each claim is
verified.
