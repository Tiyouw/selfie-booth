const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gifTimeline, gifSize } = require('../.hoplite/test-build/lib/gif.js');

test('timeline reveals photos one by one and holds the finished strip', () => {
  assert.deepEqual(gifTimeline(1), [
    { photoCount: 0, delayMs: 400 },
    { photoCount: 1, delayMs: 600 },
    { photoCount: 1, delayMs: 2000 },
  ]);
  const t3 = gifTimeline(3);
  assert.deepEqual(t3.map((f) => f.photoCount), [0, 1, 2, 3, 3]);
  assert.deepEqual(t3.map((f) => f.delayMs), [400, 600, 600, 600, 2000]);
  const t4 = gifTimeline(4);
  assert.equal(t4.length, 6);
  assert.equal(t4.filter((f) => f.photoCount === 4).length, 2);
});

test('timeline rejects strips without photos', () => {
  for (const count of [0, -1, 1.5, NaN]) {
    assert.throws(() => gifTimeline(count), /minimal satu foto/);
  }
});

test('gif sizes keep each ratio at the configured long side', () => {
  assert.deepEqual(gifSize('16:9'), { w: 480, h: 270 });
  assert.deepEqual(gifSize('9:16'), { w: 270, h: 480 });
  assert.deepEqual(gifSize('1:3'), { w: 160, h: 480 });
  assert.deepEqual(gifSize('1:3', 360), { w: 120, h: 360 });
});
