const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decompressFromEncodedURIComponent: decompress } = require('lz-string');

process.env.NEXT_PUBLIC_SHARE_API = 'https://api.test.example';
const { remoteShareProvider, shareProvider, hashShareProvider, HASH_PREFIX } = require('../.hoplite/test-build/lib/share.js');
const { buildPayload, encodeState, decodeState, defaultState } = require('../.hoplite/test-build/lib/state.js');

const state = defaultState(2);
state.slots = state.slots.map((slot, i) => ({ ...slot, src: `data:image/jpeg;base64,photo-${i}`, zoom: 1.25, ox: 0.5, oy: -0.5 }));

function withWindow(t, url) {
  globalThis.window = { location: new URL(url) };
  t.after(() => delete globalThis.window);
}

function withFetch(t, impl) {
  const calls = [];
  globalThis.fetch = (input, init) => {
    calls.push({ input: String(input), init });
    return impl(input, init);
  };
  t.after(() => { delete globalThis.fetch; });
  return calls;
}

test('buildPayload matches the encoded share payload exactly (regression)', () => {
  const payload = JSON.parse(JSON.stringify(buildPayload(state, state.slots.slice(0, 2))));
  assert.deepEqual(payload, JSON.parse(decompress(encodeState(state))));
  assert.equal(payload.v, 3);
  assert.equal(payload.s.length, 2);
});

test('remote createLink posts the payload and returns a short link with tokens', async (t) => {
  withWindow(t, 'https://fe.test/');
  const calls = withFetch(t, async () => ({
    ok: true,
    status: 201,
    json: async () => ({ id: 'Ab3xYz9Q', url: 'https://api.test.example/s/Ab3xYz9Q', gifUrl: 'https://api.test.example/v1/media/Ab3xYz9Q.gif', expiresAt: 1893456000, deleteToken: 'a'.repeat(32) }),
  }));
  const link = await remoteShareProvider.createLink(state);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, 'https://api.test.example/v1/designs');
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls[0].init.body instanceof FormData);
  assert.equal(link.provider, 'remote');
  assert.equal(link.size, 'small');
  assert.equal(link.id, 'Ab3xYz9Q');
  assert.equal(link.expiresAt, 1893456000);
  assert.equal(link.deleteToken, 'a'.repeat(32));
});

test('remote createLink falls back to the hash provider when the API fails', async (t) => {
  withWindow(t, 'https://fe.test/');
  for (const fail of [
    async () => ({ ok: false, status: 500, json: async () => ({}) }),
    () => Promise.reject(new Error('network down')),
  ]) {
    withFetch(t, fail);
    const link = await remoteShareProvider.createLink(state);
    assert.equal(link.provider, 'hash');
    assert.ok(link.url.startsWith(`https://fe.test/#${HASH_PREFIX}`));
    assert.equal(link.id, undefined);
  }
});

test('remote resolve still accepts hash links, and shareProvider switches on the env', async (t) => {
  withWindow(t, 'https://fe.test/');
  const encoded = await hashShareProvider.createLink(state);
  assert.deepEqual(await remoteShareProvider.resolve(new URL(encoded.url)), await hashShareProvider.resolve(new URL(encoded.url)));
  assert.equal(shareProvider.id, 'remote');
});

test('decodeState still round-trips a state built through the remote payload', async (t) => {
  withWindow(t, 'https://fe.test/');
  withFetch(t, async () => { throw new Error('api down'); });
  const link = await remoteShareProvider.createLink(state);
  const decoded = decodeState(link.url.split(HASH_PREFIX)[1]);
  assert.deepEqual(decoded.slots.slice(0, 2), state.slots.slice(0, 2));
});
