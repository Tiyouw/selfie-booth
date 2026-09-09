const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compressToEncodedURIComponent: compress, decompressFromEncodedURIComponent: decompress } = require('lz-string');
const { MAX_GRID, defaultState, makeSlots, visibleSlots, hasPhotos, encodeState, decodeState, sanitizeState, saveDraft, loadDraft, clearDraft } = require('../.hoplite/test-build/lib/state.js');
const { boothLayout } = require('../.hoplite/test-build/lib/layout.js');

const encodeRaw = (payload) => compress(JSON.stringify(payload));
const draftKey = 'selfie-booth:draft:v2';
const photo = (i) => `data:image/jpeg;base64,photo-${i}`;
function filled(grid = 4) {
  const state = defaultState(grid);
  state.slots = state.slots.map((slot, i) => ({ ...slot, src: photo(i), zoom: 1.125, ox: 0.25, oy: -0.5 }));
  return state;
}
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

test('new states have four stable slots and new layout semantics', () => {
  assert.equal(MAX_GRID, 4);
  assert.equal(defaultState().layoutVersion, 2);
  assert.deepEqual(makeSlots().map((slot) => slot.id), ['slot-0', 'slot-1', 'slot-2', 'slot-3']);
  assert.equal(visibleSlots(filled(2)).length, 2);
  const state = defaultState(1);
  state.slots[3].src = photo(3);
  assert.equal(hasPhotos(state), false);
});

test('v3 share round-trip keeps visible transforms but never hidden photos', () => {
  const state = filled(2);
  const encoded = encodeState(state);
  const payload = JSON.parse(decompress(encoded));
  assert.equal(payload.v, 3);
  assert.equal(payload.l, 2);
  assert.equal(payload.s.length, 2);
  assert.ok(!decompress(encoded).includes(photo(2)));
  const restored = decodeState(encoded);
  assert.deepEqual(restored.slots.slice(0, 2), state.slots.slice(0, 2));
  assert.deepEqual(restored.slots.slice(2), makeSlots().slice(2));
  assert.equal(restored.layoutVersion, 2);
  assert.equal(restored.slots.length, 4);
});

test('v3 draft round-trip keeps all four photos without changing the visible grid', (t) => {
  const entries = storage(t);
  const state = filled(1);
  assert.equal(saveDraft(state), true);
  const payload = JSON.parse(decompress(entries.get(draftKey)));
  assert.equal(payload.v, 3);
  assert.equal(payload.g, 1);
  assert.equal(payload.s.length, 4);
  assert.deepEqual(loadDraft(), state);
  clearDraft();
  assert.equal(loadDraft(), null);
});

test('v3 strip drafts preserve a hidden fourth slot despite the three-photo limit', (t) => {
  storage(t);
  const state = { ...filled(3), frameSrc: '/frames/klasik-1x3.svg', frameRatio: '1:3' };
  assert.equal(saveDraft(state), true);
  assert.deepEqual(loadDraft(), state);
  assert.equal(decodeState(encodeState(state)).slots[3].src, null);
});

for (const version of [undefined, 1, 2]) {
  test(`legacy v${version ?? 'missing'} payload retains the asymmetric portrait layout`, () => {
    const state = decodeState(encodeRaw({ v: version, g: 3, r: '9:16', f: '/frames/klasik-9x16.svg', s: [[photo(0), 1, 0, 0]] }));
    assert.equal(state.layoutVersion, 1);
    assert.equal(state.slots.length, 4);
    assert.equal(boothLayout(state).cells[0].w, 1000);
    assert.equal(boothLayout(state).cells[1].w, 486.5);
    assert.deepEqual(boothLayout(decodeState(encodeState(state))), boothLayout(state));
  });
}

test('legacy |grid suffix is honored, while no suffix preserves its payload grid', (t) => {
  const entries = storage(t);
  for (const grid of [1, 2, 3]) {
    const legacy = { v: 2, g: grid, r: '9:16', s: [[photo(0), 1, 0, 0], [photo(1), 1, 0, 0], [photo(2), 1, 0, 0]] };
    entries.set(draftKey, encodeRaw(legacy));
    assert.equal(loadDraft().grid, grid);
    entries.set(draftKey, `${encodeRaw({ ...legacy, g: 3 })}|${grid}`);
    const restored = loadDraft();
    assert.equal(restored.grid, grid);
    assert.equal(restored.layoutVersion, 1);
    assert.equal(restored.slots[2].src, photo(2));
    assert.equal(restored.slots[3].src, null);
  }
});

test('custom PNG geometry survives both share and draft round-trips', (t) => {
  storage(t);
  const state = { ...filled(3), frameRatio: '1:3', frameSrc: 'data:image/png;base64,frame', frameInset: { top: 144, right: 28, bottom: 240, left: 28 }, frameGrid: 3 };
  const shared = decodeState(encodeState(state));
  assert.equal(shared.frameGrid, 3);
  assert.deepEqual(shared.frameInset, state.frameInset);
  assert.deepEqual(boothLayout(shared), boothLayout(state));
  saveDraft(state);
  assert.deepEqual(loadDraft(), state);
});

test('validated custom geometry round-trips independently of frame image presence', () => {
  const state = { ...filled(3), frameRatio: '1:3', frameSrc: null, frameInset: { top: 180, right: 24, bottom: 180, left: 24 }, frameGrid: 3 };
  const restored = decodeState(encodeState(state));
  assert.deepEqual(restored.frameInset, state.frameInset);
  assert.equal(restored.frameGrid, 3);
  assert.deepEqual(boothLayout(restored), boothLayout(state));
});

test('untrusted data is clamped, unknown versions rejected, and unsafe geometry ignored', () => {
  assert.equal(decodeState('invalid'), null);
  assert.equal(sanitizeState(null), null);
  assert.equal(sanitizeState({ v: 99 }), null);
  const state = sanitizeState({ v: 3, g: 4, r: '1:3', f: 'https://untrusted.example/frame.png', s: [['javascript:alert(1)', 20, -8, 8]] });
  assert.equal(state.grid, 3);
  assert.equal(state.frameSrc, null);
  assert.deepEqual(state.slots[0], { id: 'slot-0', src: null, zoom: 3, ox: -1, oy: 1 });
  for (const inset of [[-1, 0, 0, 0], [1800, 0, 100, 0], [0, 400, 0, 400], [0, 0, 0], [0, '24', 0, 0], [Infinity, 0, 0, 0]]) {
    const result = sanitizeState({ v: 3, l: 2, g: 3, r: '1:3', f: 'data:image/png;base64,frame', i: inset, k: 4 });
    assert.equal(result.frameInset, undefined);
    assert.equal(result.frameGrid, undefined);
  }
  const legacy = sanitizeState({ v: 2, f: 'data:image/png;base64,frame', i: [24, 24, 24, 24], k: 2 });
  assert.equal(legacy.frameInset, undefined);
  assert.equal(legacy.frameGrid, undefined);
});

test('storage errors are safe and do not pretend a draft was saved', (t) => {
  storage(t);
  globalThis.localStorage.setItem = () => { throw new Error('quota'); };
  assert.equal(saveDraft(defaultState()), false);
  globalThis.localStorage.getItem = () => { throw new Error('blocked'); };
  assert.equal(loadDraft(), null);
  globalThis.localStorage.removeItem = () => { throw new Error('blocked'); };
  assert.doesNotThrow(clearDraft);
});
