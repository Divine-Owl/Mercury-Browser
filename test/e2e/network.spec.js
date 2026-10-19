/*
Runtime network isolation.

The static work in this sub-project proves Min's telemetry, update check,
first-run tour and translation are gone from the source. This proves nothing else
phones home at runtime, which is the half that source greps cannot cover: a URL can
be assembled from configuration, a locale string, or a dependency.

The shape of the spec matters more than its length. A spec that runs the app behind
a recording proxy and asserts "no minbrowser host was seen" passes vacuously if the
proxy is not actually in the app's path - which is the default outcome of getting
`--proxy-server` wrong, and it looks identical to success. So the spec first makes
a request it *knows* the proxy can see, and only then asks whether a minbrowser
host ever appeared.

The wait is shorter than the plan's 60 seconds, deliberately: the paths that used to
reach out (telemetry, update check, the first-run tour, page translation) were all
startup- or action-triggered, and none of the remaining code schedules periodic
network work - there is no timer-driven fetch left in main/ or js/. The spec gives
the app a page load to react to, then a further quiet window.
*/

const { test, expect } = require('@playwright/test')
const { startProxy } = require('./proxy.js')
const { launchApp, until, sleep, makeHome, writeAppSettings, webContentsList, enterUrl } = require('./harness.js')

const MIN_HOST = /minbrowser/i

test('nothing reaches a minbrowser host while the app runs', async () => {
  test.slow()

  const proxy = await startProxy()

  // The app's own proxy setting, not --proxy-server: see writeAppSettings.
  const { home } = makeHome()
  writeAppSettings(home, {
    proxy: { type: 1, proxyRules: `127.0.0.1:${proxy.port}`, proxyBypassRules: '' }
  })

  const ctx = await launchApp({ home })

  try {
    // ---- first, prove the recorder is in the app's path.
    // A plain-HTTP page is the cheapest way in: it arrives as an absolute-URI
    // request line, so the proxy knows the host without needing a TLS handshake.
    await enterUrl(ctx.ui, ctx.app, 'http://example.com/')

    await until(() => proxy.hosts().some(host => host.endsWith('example.com')), {
      what: 'the proxy to see the page the spec asked for (without this the assertion below is vacuous)',
      timeout: 30000
    })

    // ---- and now the quiet window.
    await sleep(20000)

    const reached = proxy.hosts()
    expect(reached.length).toBeGreaterThan(0)
    expect(reached.filter(host => MIN_HOST.test(host))).toEqual([])

    // Same claim from the app's side, so a bug in the proxy cannot hide anything:
    // no open webContents is sitting on a minbrowser URL either.
    const contents = await webContentsList(ctx.app)
    expect(contents.filter(wc => MIN_HOST.test(wc.url))).toEqual([])
  } finally {
    await proxy.close()
    await ctx.close()
  }
})
