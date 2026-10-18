/*
A proxy that records who wanted to talk to what, and then refuses.

It is the evidence collector for the network spec: every HTTP request line and
every CONNECT tunnel is logged with its host, and every connection is closed with
a 502. Nothing is forwarded, so the spec never depends on the network being up and
never waits on a real host - it only needs to know which hosts the app *tried* to
reach.

Both forms matter. Chromium sends plain-HTTP requests to a proxy in absolute form
("GET http://host/path HTTP/1.1"), while HTTPS arrives as a CONNECT tunnel whose
request line is just "host:port" - so a spec that only handled one of them would
be blind to half the traffic.
*/

const http = require('http')

function hostOf (value) {
  if (!value) return ''
  try {
    if (value.includes('://')) return new URL(value).hostname
  } catch (e) {
    /* not a URL; fall through to the host:port form */
  }
  return value.split(':')[0]
}

function startProxy () {
  const requests = []

  const server = http.createServer((req, res) => {
    requests.push({
      kind: 'http',
      method: req.method,
      url: req.url,
      host: hostOf(req.url) || hostOf(req.headers.host)
    })
    res.writeHead(502, { 'content-type': 'text/plain' })
    res.end('the e2e proxy does not forward anything')
  })

  server.on('connect', (req, socket) => {
    requests.push({ kind: 'connect', url: req.url, host: hostOf(req.url) })
    socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
  })

  // A stray client reset must not take the recorder down with it.
  server.on('clientError', (err, socket) => {
    if (socket && !socket.destroyed) socket.destroy()
  })

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        requests,
        hosts: () => [...new Set(requests.map(r => r.host).filter(Boolean))],
        close: () => new Promise(done => server.close(() => done()))
      })
    })
  })
}

module.exports = { startProxy, hostOf }
