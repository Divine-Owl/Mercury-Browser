#!/usr/bin/env node
/*
Generates the Mercury app icon placeholder.

The mark is drawn from geometry rather than a font or a drawing library, for two
reasons: it has no dependency to install, and the output is byte-identical
wherever it runs, so regenerating it produces no spurious diff.

It is a placeholder. It exists so that packaging works, the window icon in
main/main.js resolves, and Task 12's window-association check has something real
to look at. Replace this file and the icons it writes once final artwork exists -
or keep drawing the real mark here, which is the point of committing a generator
rather than three opaque binaries.

  node scripts/buildIcons.js

Writes icons/icon256.png (Linux, and the runtime window icon),
       icons/icon256.ico (Windows, not built in v0.1),
       icons/icon.icns  (macOS, not built in v0.1).
*/

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const OUT = path.join(__dirname, '..', 'icons')

// Supersampling factor: each output pixel averages SS x SS subsamples, which is
// what makes the corners and the diagonal strokes of the M smooth.
const SS = 4

// Distance from a point to the edge of a rounded rectangle; negative inside.
function roundRectDistance (x, y, size, margin, radius) {
  const left = margin + radius
  const right = size - margin - radius
  const top = margin + radius
  const bottom = size - margin - radius
  const nearX = Math.min(Math.max(x, left), right)
  const nearY = Math.min(Math.max(y, top), bottom)
  return Math.hypot(x - nearX, y - nearY) - radius
}

function segmentDistance (px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  let t = len2 === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / len2
  t = Math.min(Math.max(t, 0), 1)
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
}

// A rounded square in a violet gradient with a white M, returned as straight
// (non-premultiplied) RGBA.
function render (size) {
  const buf = Buffer.alloc(size * size * 4)
  const margin = size * 0.055
  const radius = size * 0.235
  const stroke = size * 0.085

  const inset = size * 0.275
  const top = inset
  const bottom = size - inset
  const left = size * 0.285
  const right = size - left
  const m = [
    [left, bottom],
    [left, top],
    [size / 2, top + (bottom - top) * 0.62],
    [right, top],
    [right, bottom]
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let covered = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (roundRectDistance(px, py, size, margin, radius) > 0) continue
          covered++

          // indigo -> violet, top to bottom
          const t = py / size
          let cr = 0x4f + (0x7c - 0x4f) * t
          let cg = 0x46 + (0x3a - 0x46) * t
          let cb = 0xe5 + (0xed - 0xe5) * t

          let d = Infinity
          for (let i = 0; i < m.length - 1; i++) {
            d = Math.min(d, segmentDistance(px, py, m[i][0], m[i][1], m[i + 1][0], m[i + 1][1]))
          }
          if (d <= stroke / 2) {
            cr = 0xff
            cg = 0xff
            cb = 0xff
          }

          r += cr
          g += cg
          b += cb
        }
      }

      if (covered === 0) continue
      const i = (y * size + x) * 4
      buf[i] = Math.round(r / covered)
      buf[i + 1] = Math.round(g / covered)
      buf[i + 2] = Math.round(b / covered)
      buf[i + 3] = Math.round((covered / (SS * SS)) * 255)
    }
  }
  return buf
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32 (buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk (type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

function encodePng (size, rgba) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0 // filter type: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ICO: one directory entry per size, each holding a whole PNG. Windows has
// accepted PNG-compressed entries since Vista, and 256 is encoded as 0 in the
// single-byte width/height fields.
function encodeIco (entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = header.length + directory.length
  entries.forEach((entry, i) => {
    const o = i * 16
    directory[o] = entry.size >= 256 ? 0 : entry.size
    directory[o + 1] = entry.size >= 256 ? 0 : entry.size
    directory[o + 2] = 0 // palette size
    directory[o + 3] = 0 // reserved
    directory.writeUInt16LE(1, o + 4) // colour planes
    directory.writeUInt16LE(32, o + 6) // bits per pixel
    directory.writeUInt32LE(entry.png.length, o + 8)
    directory.writeUInt32LE(offset, o + 12)
    offset += entry.png.length
  })

  return Buffer.concat([header, directory, ...entries.map(entry => entry.png)])
}

// ICNS: 'icns' + total length, then type/length/data entries, also PNG payloads.
function encodeIcns (entries) {
  const parts = []
  let total = 8
  for (const entry of entries) {
    const head = Buffer.alloc(8)
    head.write(entry.type, 0, 4, 'ascii')
    head.writeUInt32BE(entry.png.length + 8, 4)
    parts.push(head, entry.png)
    total += 8 + entry.png.length
  }
  const head = Buffer.alloc(8)
  head.write('icns', 0, 4, 'ascii')
  head.writeUInt32BE(total, 4)
  return Buffer.concat([head, ...parts])
}

function main () {
  const rendered = new Map()
  const png = size => {
    if (!rendered.has(size)) rendered.set(size, encodePng(size, render(size)))
    return rendered.get(size)
  }

  fs.mkdirSync(OUT, { recursive: true })

  const written = [
    ['icon256.png', png(256)],
    ['icon256.ico', encodeIco([16, 32, 48, 64, 128, 256].map(size => ({ size, png: png(size) })))],
    ['icon.icns', encodeIcns([
      { type: 'ic07', png: png(128) },
      { type: 'ic08', png: png(256) },
      { type: 'ic09', png: png(512) }
    ])]
  ]

  for (const [name, data] of written) {
    fs.writeFileSync(path.join(OUT, name), data)
    console.log(`wrote icons/${name} (${data.length} bytes)`)
  }
}

main()
