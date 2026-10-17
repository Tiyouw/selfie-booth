const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectTransparentWindows, insetFromWindows } = require('../.hoplite/test-build/lib/frameGeom.js');

/** RGBA buffer helper: opaque everywhere unless a rect is cleared. */
function canvas(w, h, rects = []) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 34; rgba[i + 1] = 30; rgba[i + 2] = 28; rgba[i + 3] = 255;
  }
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) rgba[(y * w + x) * 4 + 3] = 0;
    }
  }
  return rgba;
}

test('detects stacked portrait windows (real 1:3 frame shape)', () => {
  const w = 640, h = 1920;
  const rects = [
    { x: 27, y: 143, w: 585, h: 503 },
    { x: 27, y: 661, w: 585, h: 502 },
    { x: 27, y: 1178, w: 585, h: 502 },
  ];
  const windows = detectTransparentWindows(canvas(w, h, rects), w, h);
  assert.equal(windows.length, 3);
  assert.deepEqual(windows.map((r) => [r.x, r.y, r.w, r.h]), rects.map((r) => [r.x, r.y, r.w, r.h]));
  // A tiny opaque element inside a window must not split it.
  const withLogo = canvas(w, h, [...rects, { x: 90, y: 1570, w: 497, h: 110 }]);
  const still3 = detectTransparentWindows(withLogo, w, h);
  assert.equal(still3.length, 3);
  assert.deepEqual(still3.map((r) => [r.x, r.y, r.w, r.h]), rects.map((r) => [r.x, r.y, r.w, r.h]));
});

test('ignores small stray transparent pixels and reports none for opaque canvases', () => {
  const w = 640, h = 1920;
  const stray = detectTransparentWindows(canvas(w, h, [{ x: 5, y: 5, w: 3, h: 3 }]), w, h);
  assert.equal(stray.length, 0);
  assert.equal(detectTransparentWindows(canvas(w, h), w, h).length, 0);
  assert.equal(insetFromWindows(stray, w, h), null);
});

test('detects side-by-side landscape windows and derives the inset', () => {
  const w = 1920, h = 1080;
  const rects = [
    { x: 40, y: 48, w: 904, h: 984 },
    { x: 976, y: 48, w: 904, h: 984 },
  ];
  const windows = detectTransparentWindows(canvas(w, h, rects), w, h);
  assert.equal(windows.length, 2);
  assert.deepEqual(insetFromWindows(windows, w, h), { top: 48, right: 40, bottom: 48, left: 40 });
});

test('semi-transparent pixels below the alpha threshold count as windows', () => {
  const w = 640, h = 1920;
  const rgba = canvas(w, h, [{ x: 30, y: 100, w: 500, h: 400 }]);
  // alpha 15 is still "transparent" for window detection
  for (let y = 100; y < 500; y++) for (let x = 30; x < 530; x++) rgba[(y * w + x) * 4 + 3] = 15;
  const windows = detectTransparentWindows(rgba, w, h);
  assert.equal(windows.length, 1);
});

test('four tinted landscape windows are not mistaken for two clear decoration holes', () => {
  const w = 1920, h = 1080;
  const rects = [
    { x: 40, y: 40, w: 906, h: 486 },
    { x: 974, y: 40, w: 906, h: 486 },
    { x: 40, y: 554, w: 906, h: 486 },
    { x: 974, y: 554, w: 906, h: 486 },
  ];
  const rgba = canvas(w, h);
  for (const [i, r] of rects.entries()) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        // Tint plus a stronger lightning band, as in the reported Hijau169 PNG.
        rgba[(y * w + x) * 4 + 3] = y < r.y + 120 ? 126 : i < 2 ? 76 : 71;
      }
    }
  }
  for (const [left, top] of [[40, 40], [1726, 804]]) {
    for (let y = top; y < top + 236; y++) for (let x = left; x < left + 154; x++) rgba[(y * w + x) * 4 + 3] = 0;
  }
  // Reproduce the old mistake before asserting the corrected detection.
  assert.equal(detectTransparentWindows(rgba, w, h, { alphaMax: 16 }).length, 2);
  const windows = detectTransparentWindows(rgba, w, h);
  assert.deepEqual(windows.map(({ x, y, w, h }) => ({ x, y, w, h })), rects);
  assert.deepEqual(insetFromWindows(windows, w, h), { top: 40, right: 40, bottom: 40, left: 40 });
  assert.equal(rgba[(300 * w + 400) * 4 + 3], 76, 'analysis must preserve the overlay alpha');
});

test('tinted windows do not require any completely clear pixel; near-opaque artwork stays excluded', () => {
  const w = 400, h = 300;
  const rgba = canvas(w, h, [{ x: 30, y: 40, w: 300, h: 200 }]);
  for (const alpha of [71, 76, 126, 128, 129, 254, 255]) {
    for (let y = 40; y < 240; y++) for (let x = 30; x < 330; x++) rgba[(y * w + x) * 4 + 3] = alpha;
    assert.equal(detectTransparentWindows(rgba, w, h).length, alpha <= 128 ? 1 : 0, `alpha=${alpha}`);
  }
});
