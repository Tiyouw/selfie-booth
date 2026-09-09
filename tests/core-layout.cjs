const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boothLayout, exportSize, gridGap, gridLayout, photoInset } = require('../.hoplite/test-build/lib/layout.js');
const { defaultState } = require('../.hoplite/test-build/lib/state.js');
const { BUILTIN_FRAMES, frameVariant, framesForRatio } = require('../.hoplite/test-build/lib/frames.js');
const { readFileSync } = require('node:fs');

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

test('native sizes and gap are ratio aware', () => {
  assert.deepEqual(exportSize('16:9'), { w: 1920, h: 1080 });
  assert.deepEqual(exportSize('9:16'), { w: 1080, h: 1920 });
  assert.deepEqual(exportSize('1:3'), { w: 640, h: 1920 });
  assert.equal(gridGap(640, 1920), 16);
});

for (const ratio of ['9:16', '1:3']) {
  test(`${ratio} uses three equal vertical rows in new layouts`, () => {
    const state = { ...defaultState(3), frameRatio: ratio, frameSrc: null };
    const { w, h, cells } = boothLayout(state);
    const gap = gridGap(w, h);
    assert.equal(cells.length, 3);
    for (let i = 0; i < cells.length; i++) {
      close(cells[i].x, gap);
      close(cells[i].w, w - 2 * gap);
      close(cells[i].h, (h - 4 * gap) / 3);
      close(cells[i].y, gap + i * (cells[i].h + gap));
    }
  });
}

test('missing or explicit legacy layout version keeps asymmetric portrait-three geometry', () => {
  const state = { ...defaultState(3), frameRatio: '9:16', layoutVersion: undefined };
  const { cells } = boothLayout(state);
  assert.deepEqual(cells, [
    { x: 40, y: 40, w: 1000, h: (1840 - 27) * 0.55 },
    { x: 40, y: 40 + (1840 - 27) * 0.55 + 27, w: (1000 - 27) / 2, h: 1840 - (1840 - 27) * 0.55 - 27 },
    { x: 40 + (1000 - 27) / 2 + 27, y: 40 + (1840 - 27) * 0.55 + 27, w: (1000 - 27) / 2, h: 1840 - (1840 - 27) * 0.55 - 27 },
  ]);
  assert.deepEqual(boothLayout({ ...state, layoutVersion: 1 }).cells, cells);
  assert.notDeepEqual(boothLayout({ ...state, layoutVersion: 2 }).cells, cells);
});

test('landscape-four is equal 2×2 in reading order', () => {
  const { cells } = boothLayout(defaultState(4));
  assert.deepEqual(cells, [
    { x: 40, y: 40, w: 906.5, h: 486.5 },
    { x: 973.5, y: 40, w: 906.5, h: 486.5 },
    { x: 40, y: 553.5, w: 906.5, h: 486.5 },
    { x: 973.5, y: 553.5, w: 906.5, h: 486.5 },
  ]);
});

test('four-cell portrait geometry is explicitly disallowed', () => {
  for (const ratio of ['9:16', '1:3']) {
    assert.throws(() => boothLayout({ ...defaultState(4), frameRatio: ratio }), RangeError);
  }
});

test('existing one, two and landscape-three layouts are unchanged by layout version', () => {
  for (const ratio of ['16:9', '9:16']) {
    for (const grid of [1, 2, ...(ratio === '16:9' ? [3] : [])]) {
      const state = { ...defaultState(grid), frameRatio: ratio };
      assert.deepEqual(boothLayout({ ...state, layoutVersion: 1 }), boothLayout({ ...state, layoutVersion: 2 }));
    }
  }
  assert.equal(boothLayout(defaultState(3)).cells[0].h, 1000);
});

test('custom inset takes precedence and is shared by layout', () => {
  const inset = { top: 160, right: 30, bottom: 210, left: 30 };
  const state = { ...defaultState(3), frameRatio: '1:3', frameInset: inset, frameGrid: 3 };
  assert.deepEqual(photoInset(state, 640, 1920), inset);
  const { cells } = boothLayout(state);
  assert.deepEqual(cells, gridLayout(3, 640, 1920, inset, 16, true, 2));
});

test('each design has all ratios, with generated strip artwork and header/footer room', () => {
  assert.equal(BUILTIN_FRAMES.length, 9);
  for (const ratio of ['16:9', '9:16', '1:3']) assert.equal(framesForRatio(ratio).length, 3);
  for (const frame of framesForRatio('1:3')) {
    const { inset } = frame;
    assert.ok(inset.top >= 120 && inset.bottom >= 160);
    const { w, h, cells } = boothLayout({ ...defaultState(3), frameRatio: '1:3', frameSrc: frame.src });
    assert.equal(cells[0].y, inset.top);
    close(cells[2].y + cells[2].h, h - inset.bottom);
    assert.equal(frameVariant(frame.src, '16:9').name, frame.name);
    const svg = readFileSync(`public${frame.src}`, 'utf8');
    assert.ok(svg.includes(`width="${w}" height="${h}"`));
    assert.ok(svg.includes(`M${inset.left + 14} ${inset.top}H${w - inset.right - 14}`));
  }
});
