const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.NEXT_PUBLIC_SHARE_API = 'https://api.test/';
const mod = require('../.hoplite/test-build/lib/communityFrames.js');
const { listCommunityFrames, addCommunityFrame, deleteCommunityFrame, communityEnabled } = mod;

const RECORD = {
  id: 'AbCdEf01',
  name: 'Hijau',
  ratio: '1:3',
  grid: 3,
  inset: { top: 143, right: 28, bottom: 240, left: 27 },
  createdAt: 1700000000,
};

function stubFetch(respond) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  fn.calls = calls;
  return fn;
}

function jsonRes(status, body) {
  return { ok: status < 400, status, json: async () => body };
}

test('enabled only when the share API is configured; list normalizes records', async () => {
  assert.equal(communityEnabled(), true);
  const fetchFn = stubFetch(() => jsonRes(200, { frames: [RECORD, { id: 'x' }, null] }));
  const frames = await listCommunityFrames('1:3', fetchFn);
  assert.equal(fetchFn.calls[0].url, 'https://api.test/v1/frames?ratio=1%3A3');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].id, 'AbCdEf01');
  assert.deepEqual(frames[0].inset, RECORD.inset);
  assert.equal(frames[0].imageUrl, 'https://api.test/v1/frames/AbCdEf01/image');
});

test('add sends multipart with the code and returns the created record', async () => {
  const dataUrl = 'data:image/png;base64,AAAA';
  const fetchFn = stubFetch((url, init) => {
    if (init.method === 'POST') return jsonRes(201, { ...RECORD, id: 'NewFrame1' });
    return { ok: true, status: 200, blob: async () => 'PNG-BYTES' };
  });
  const frame = await addCommunityFrame({ name: 'Hijau', code: 'hmsf', dataUrl }, fetchFn);
  assert.equal(frame.id, 'NewFrame1');
  const post = fetchFn.calls.find((c) => c.init.method === 'POST');
  assert.equal(post.url, 'https://api.test/v1/frames');
  const form = post.init.body;
  assert.equal(form.get('code'), 'hmsf');
  assert.equal(form.get('name'), 'Hijau');
  assert.equal(form.get('png').type, 'image/png');
});

test('add maps server rejections to readable errors', async () => {
  for (const [status, body, message] of [
    [403, { error: 'forbidden' }, 'Kode akses salah.'],
    [413, { error: 'too_large' }, 'Frame terlalu besar untuk koleksi komunitas.'],
    [400, { message: 'Frame harus memiliki 1–3 jendela foto transparan yang jelas.' }, 'Frame harus memiliki 1–3 jendela foto transparan yang jelas.'],
    [500, {}, 'Gagal menambahkan frame ke koleksi komunitas.'],
  ]) {
    const fetchFn = stubFetch((url, init) => (init.method === 'POST' ? jsonRes(status, body) : { ok: true, status: 200, blob: async () => 'PNG-BYTES' }));
    await assert.rejects(addCommunityFrame({ name: 'X', code: 'hmsf', dataUrl: 'data:image/png;base64,AA' }, fetchFn), { message });
  }
});

test('delete sends the code header and surfaces 403/404', async () => {
  const fetchFn = stubFetch((url, init) => {
    assert.equal(url, 'https://api.test/v1/frames/AbCdEf01');
    assert.equal(init.method, 'DELETE');
    assert.equal(init.headers['X-Frame-Code'], 'hmsf');
    return { ok: true, status: 204 };
  });
  await deleteCommunityFrame('AbCdEf01', 'hmsf', fetchFn);

  const denied = stubFetch(() => jsonRes(403, { error: 'forbidden' }));
  await assert.rejects(deleteCommunityFrame('AbCdEf01', 'nope', denied), { message: 'Kode akses salah.' });
});
