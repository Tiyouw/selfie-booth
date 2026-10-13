// Dev helper: decode a PNG frame and report its transparent photo windows,
// then compare with the cell layout the app would use for candidate insets.
// Usage: node scripts/analyze-frame.cjs <file.png> [grid]
const fs = require('node:fs');
const zlib = require('node:zlib');

function decodePng(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('bukan PNG');
  let i = 8;
  let w = 0, h = 0, bitDepth = 8, colorType = 6;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    i += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} tidak didukung`);
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      cur[x] = v;
    }
  }
  return { w, h, bpp, data: out };
}

/** Bounding boxes of sizeable fully-transparent regions (4-connectivity). */
function detectWindows(png, alphaMax = 16) {
  const { w, h, bpp, data } = png;
  const seen = new Uint8Array(w * h);
  const minArea = Math.floor(w * h * 0.005);
  const windows = [];
  const stack = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (seen[idx]) continue;
      const alpha = data[y * w * bpp + x * bpp + (bpp - 1)];
      if (alpha > alphaMax) continue;
      // flood fill
      stack.length = 0;
      stack.push(idx);
      seen[idx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, area = 0;
      while (stack.length) {
        const p = stack.pop();
        const px = p % w, py = (p / w) | 0;
        area++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nidx = ny * w + nx;
          if (seen[nidx]) continue;
          const nalpha = data[ny * w * bpp + nx * bpp + (bpp - 1)];
          if (nalpha > alphaMax) continue;
          seen[nidx] = 1;
          stack.push(nidx);
        }
      }
      if (area >= minArea) windows.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
    }
  }
  windows.sort((a, b) => a.y - b.y || a.x - b.x);
  return windows;
}

const file = process.argv[2];
const grid = Number(process.argv[3] ?? 3);
const png = decodePng(fs.readFileSync(file));
console.log(`PNG ${png.w}x${png.h} bpp=${png.bpp}`);
const windows = detectWindows(png);
console.log(`jendela transparan terdeteksi: ${windows.length}`);
for (const [i, win] of windows.entries()) {
  console.log(`  #${i + 1}: x=${win.x} y=${win.y} w=${win.w} h=${win.h} (area ${win.area}px)`);
}
if (!windows.length) { console.log('tidak ada jendela besar — frame menutup seluruh kanvas'); process.exit(0); }
const x1 = Math.max(...windows.map((r) => r.x + r.w));
const y1 = Math.max(...windows.map((r) => r.y + r.h));
const inset = {
  top: Math.min(...windows.map((r) => r.y)),
  left: Math.min(...windows.map((r) => r.x)),
  bottom: png.h - y1,
  right: png.w - x1,
};
console.log('inset terukur dari jendela:', JSON.stringify(inset));

const { gridLayout, gridGap } = require('../.hoplite/test-build/lib/layout.js');
const gap = gridGap(png.w, png.h);
const cells = gridLayout(grid, png.w, png.h, inset, gap, png.w < png.h, 2);
console.log(`sel yang akan dipakai app (grid ${grid}, gap ${gap}, v2):`);
for (const [i, c] of cells.entries()) console.log(`  #${i + 1}: x=${Math.round(c.x)} y=${Math.round(c.y)} w=${Math.round(c.w)} h=${Math.round(c.h)}`);
