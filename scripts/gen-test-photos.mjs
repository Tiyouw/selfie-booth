// Dev helper: write a few solid-colour PNG test photos to .hoplite/artifacts/.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

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
function png(w, h, fill) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fill(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('.hoplite/artifacts', { recursive: true });
// portrait photo with a bright center square so pan/zoom is visible
writeFileSync('.hoplite/artifacts/photo-a.png', png(900, 1600, (x, y) => {
  const c = Math.abs(x - 450) < 200 && Math.abs(y - 800) < 200;
  return c ? [255, 200, 60] : [40 + (y / 1600) * 120, 60, 160];
}));
// landscape photo, 4000px wide to exercise compression
writeFileSync('.hoplite/artifacts/photo-b.png', png(4000, 2250, (x, y) => [
  (x / 4000) * 255, 120, (y / 2250) * 255,
]));
writeFileSync('.hoplite/artifacts/photo-c.png', png(1200, 1200, (x, y) => [
  30, 180 + Math.sin(x / 40) * 60, 120 + Math.cos(y / 40) * 60,
]));
console.log('ok');
