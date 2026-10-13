// Local integration seed: tiny solid PNGs → v3 draft payload for localStorage.
// Output: .hoplite/artifacts/draft-seed.txt (value for key 'selfie-booth:draft:v2')
const fs = require('node:fs');
const { deflateSync } = require('node:zlib');
const { compressToEncodedURIComponent: compress } = require('lz-string');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r + Math.floor((x / w) * 60); raw[o + 1] = g; raw[o + 2] = b + Math.floor((y / h) * 60);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const photos = [
  png(16, 16, [220, 60, 60]),
  png(16, 16, [60, 200, 90]),
  png(16, 16, [70, 80, 220]),
].map((b) => `data:image/png;base64,${b.toString('base64')}`);
const slots = photos.map((src, i) => [src, 1.15, 0.2, -0.1]);
while (slots.length < 4) slots.push([null, 1, 0, 0]);
const payload = { v: 3, g: 3, f: '/frames/polaroid-9x16.svg', r: '9:16', l: 2, s: slots };
const encoded = `${compress(JSON.stringify(payload))}|3`;
fs.writeFileSync('.hoplite/artifacts/draft-seed.txt', encoded);
console.log('seed bytes:', encoded.length, '| key: selfie-booth:draft:v2');
