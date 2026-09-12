const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFrameLibrary, saveFrameLibrary, addFrameToLibrary, removeFrameFromLibrary, MAX_SAVED_FRAMES } = require('../.hoplite/test-build/lib/frameLibrary.js');

const KEY = 'selfie-booth:frames:v1';
const png = (n) => `data:image/png;base64,frame-${n}`;

function storage(t) {
  const entries = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  } });
  t.after(() => delete globalThis.localStorage);
  return entries;
}

function frame(n, extra = {}) {
  return { name: `Frame ${n}`, src: png(n), ratio: '1:3', grid: 3, inset: { top: 143, right: 28, bottom: 240, left: 27 }, ...extra };
}

test('added frames round-trip and survive a simulated refresh', (t) => {
  const entries = storage(t);
  const { frames, saved } = addFrameToLibrary(frame('a'));
  assert.equal(saved, true);
  assert.equal(frames.length, 1);
  assert.ok(entries.get(KEY));

  // "refresh": a later read with the same storage sees the same frames
  const loaded = loadFrameLibrary();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, 'Frame a');
  assert.equal(loaded[0].ratio, '1:3');
  assert.equal(loaded[0].grid, 3);
  assert.deepEqual(loaded[0].inset, { top: 143, right: 28, bottom: 240, left: 27 });
  assert.ok(loaded[0].id && loaded[0].createdAt > 0);
});

test('re-uploading the same src refreshes that entry instead of duplicating', (t) => {
  storage(t);
  addFrameToLibrary(frame('a'));
  const { frames } = addFrameToLibrary(frame('a', { name: 'Hijau v2', inset: null }));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].name, 'Hijau v2');
  assert.equal(frames[0].inset, null);
});

test('library is capped and oldest entries beyond the cap are dropped', (t) => {
  storage(t);
  for (let i = 0; i < MAX_SAVED_FRAMES + 3; i++) addFrameToLibrary(frame(`f${i}`));
  assert.equal(loadFrameLibrary().length, MAX_SAVED_FRAMES);
  // newest first
  assert.equal(loadFrameLibrary()[0].name, `Frame f${MAX_SAVED_FRAMES + 2}`);
});

test('removeFrameFromLibrary deletes one entry and keeps the rest', (t) => {
  storage(t);
  addFrameToLibrary(frame('a'));
  addFrameToLibrary(frame('b'));
  const id = loadFrameLibrary().find((f) => f.name === 'Frame a').id;
  const rest = removeFrameFromLibrary(id);
  assert.deepEqual(loadFrameLibrary().map((f) => f.name), ['Frame b']);
  assert.equal(rest.length, 1);
});

test('corrupt or invalid entries are filtered on load, not trusted', (t) => {
  const entries = storage(t);
  entries.set(KEY, JSON.stringify([
    { id: 'x1', name: 'ok', src: png('ok'), ratio: '9:16', grid: 2, inset: null, createdAt: 1 },
    { id: 'x2', name: 'no src', ratio: '9:16', grid: 2, createdAt: 2 },
    { id: 'x3', name: 'bad ratio', src: png('bad'), ratio: '4:5', grid: 2, createdAt: 3 },
    { id: 'x4', name: 'bad inset kept as null', src: png('inset'), ratio: '16:9', grid: 4, inset: { top: 'x' }, createdAt: 4 },
    'not-an-object',
  ]));
  const loaded = loadFrameLibrary();
  assert.deepEqual(loaded.map((f) => f.id), ['x1', 'x4']);
  assert.equal(loaded[1].inset, null);
});

test('quota failures are reported, not silently pretending success', (t) => {
  const entries = storage(t);
  addFrameToLibrary(frame('a'));
  const original = entries.set.bind(entries);
  entries.set = () => { throw new Error('quota'); };
  t.after(() => { entries.set = original; });
  const { frames, saved } = addFrameToLibrary(frame('b'));
  assert.equal(saved, false);
  assert.equal(frames.length, 2); // the in-memory result is still coherent
  assert.equal(loadFrameLibrary().length, 1); // storage kept the pre-failure state
});

test('storage errors on load degrade to an empty library', (t) => {
  const entries = storage(t);
  entries.set(KEY, '{not json');
  assert.deepEqual(loadFrameLibrary(), []);
});
