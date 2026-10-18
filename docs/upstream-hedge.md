# Upstream hedge

Mercury is a hard fork of Min v1.35.7 with **no shared git history**. That decision
bought a clean repository, and this document is the price: upstream fixes cannot
reach Mercury by merging, so they have to be fetched, read, and applied by hand.

Nothing about this happens on its own. A fresh repository has no upstream history,
no upstream branches to notice, and no merge conflicts to surface — an upstream
security fix is invisible here until someone goes looking. That is why the cadence
below is a scheduled action rather than a habit.

## Cadence

**Monthly.** On the first working day of each month, run the review below against
whatever upstream has released since the last review, and record it.

Do it on schedule even when nothing looks urgent: the point is to find out whether
something is urgent, and upstream does not announce which of its changes matter to
a fork that has removed its telemetry.

## Why not merge

The remote is `fetch`-only, and that is enforced rather than remembered: its push
URL is set to `DISABLED`, so `git push upstream` fails instead of publishing to Min.
A new checkout should do the same:

```bash
git remote -v                          # upstream: fetch, and DISABLED for push
git remote set-url --push upstream DISABLED
git fetch upstream --tags              # refresh refs; never merged
git ls-remote --tags upstream | tail -20   # what has been released
```

`git merge upstream/master` would have to splice two unrelated histories together,
which means dragging Min's history - and Min's identity, telemetry, update feed and
translation service - back into a repository that deliberately removed all of it.
Every rebranded locale, every renamed URL, every deleted module would collide at
once, and the identity tests would correctly go red. So: apply the specific changes
that matter, one at a time, and keep the history flat.

## The review

1. **Find the range.** From the last reviewed tag (v1.35.7 as of this fork) to the
   newest release tag:

   ```bash
   git fetch upstream --tags
   NEW=$(git tag --list 'v1.35.8*' 'v1.36*' 'v1.37*' | sort -V | tail -1)
   git diff --stat v1.35.7.."$NEW"
   curl -L "https://github.com/minbrowser/min/compare/v1.35.7...$NEW.diff" -o /tmp/upstream.diff
   ```

   The `.diff` URL is the same range as the local diff; the local one is faster
   once the fetch is done.

2. **Read it against the file list, not the diff stat.** The diff stat tells you
   how much changed; only the hunks tell you whether a change is security-relevant.

3. **What to look for**, roughly in order of value:

   - **Anything in `main/` or a preload script.** Process isolation, protocol
     handling, permission prompts, download handling and `webPreferences` changes
     are the highest-severity class this fork can inherit.
   - **`js/util/urlParser.js`.** URL parsing and scheme handling are where a fork
     that renamed a scheme is most likely to have diverged.
   - **Third-party components under `ext/`.** `ext/abp-filter-parser-modified`,
     `ext/readability-master`, `ext/franc`, `ext/xregexp`, `ext/textColor`,
     `ext/publicSuffixes`. Bumps here are often the actual security fix.
   - **Filter lists and the HTTPS upgrade list** deserve their own look: they are
     data, they ship in the package, and updating them is its own task
     (`npm run updateFilters`, `npm run updateHttpsList`, `npm run updateSuffixes`).
   - **Dependency ranges in `package.json`**, especially anything rendering
     untrusted content.

4. **What to ignore.** This fork deliberately diverges, and upstream work on the
   following is not a fix to port: statistics/telemetry, the update feed, the
   first-run tour, page translation, the survey, branding and icons, and
   localisation strings for any of those. Upstream's own i18n churn on unrelated
   strings can be skipped wholesale — this fork's locale *keys* are frozen and its
   values are rebranded.

5. **Apply selectively, one concern at a time:**

   ```bash
   git checkout -b hedge/v1.35.9-<concern>
   git apply --stat /tmp/upstream.diff                 # preview
   git apply --include='main/*' /tmp/upstream.diff     # or extract the diff you want
   git diff                                            # read it before committing
   ```

   `git apply --include`/`--exclude` is how a single concern is separated from
   surrounding churn. If a hunk does not apply because of the rename, adapt it by
   hand rather than forcing it — a hunk touching `min://` or a Min brand string is
   exactly the kind of change that must be translated, not pasted.

6. **Verify with the same gates as any other change:**

   ```bash
   npm run build
   npm run test:unit
   npm run test:lint
   xvfb-run -a npm run test:e2e
   ```

   Two of those are hedges in their own right. `test/no-min-infrastructure.test.js`
   fails if an applied upstream change reintroduces telemetry, the update feed, the
   tour or translation. `test/e2e/network.spec.js` fails if anything starts talking
   to a `minbrowser` host. A patch that brings either back is not a merge problem;
   it is the fork's central promise breaking, and the tests will say so.

## Electron

Bundled Electron is Mercury's highest-value patch stream, and it is independent of
Min's release cycle: Min is a client of Electron, but this fork now owns engine
security for the browser it ships.

- Track Electron releases (`https://releases.electronjs.org/`) and, at minimum,
  stay on the latest patch of the current major line.
- Bump in `package.json`, then run the full gate above plus the package build in
  CI, because the packaging identity depends on Electron behaviour
  (`desktopName` → `app_id`/`WM_CLASS`) and a major bump is exactly where that
  breaks.
- An Electron bump is not "wait for upstream to do it" work. Upstream's own bump
  is a hint, not a schedule.

## Review log

Record each review, including the ones that conclude "nothing to port". A missing
log entry means the review did not happen, because nothing else in this repository
will show it.

| Date | Reviewed range | Outcome | Commit(s) |
| --- | --- | --- | --- |
| 2026-10-18 | fork point: Min v1.35.7 | Initial import | `03b139a` |
