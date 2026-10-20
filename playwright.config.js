/*
Playwright configuration for the runtime specs.

`test:e2e` runs Electron only - there are no browser projects here. Playwright's
runner is used rather than node:test for two things it does that matter for GUI
specs on a shared runner: per-test timeouts with a clear failure, and retries.

Retries are on for CI and off locally, on purpose. A retry in CI absorbs the real
flakiness of starting a GPU-less Chromium under xvfb on a two-core runner; locally
a retry would hide exactly the kind of intermittent failure worth seeing while
developing. Playwright reports a retried test as "flaky", so an absorbed failure
still shows up in the run summary rather than disappearing.
*/

const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './test/e2e',
  // harness.js and proxy.js are support code, not specs.
  testMatch: '**/*.spec.js',
  timeout: 120000,
  expect: { timeout: 15000 },
  // One Electron app at a time: each spec launches its own, and these specs are
  // bound by app startup rather than by CPU.
  fullyParallel: false,
  workers: 1,
  // Two, not one: the app dies on its own in roughly one launch in ten (a
  // measured fact, in the plan's fact table), and a run has many tests that each
  // need an app - so one retry is not enough to absorb a run in which three
  // different tests each hit it. Locally the visible run keeps its zero retries,
  // so the flake stays visible.
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  // A trace of a window Playwright does not own the lifecycle of is noise here;
  // the specs print what they observed instead.
  use: { trace: 'off' }
})
