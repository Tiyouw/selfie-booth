import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { openDb } from '../src/db';
import { makeFramePng, polaroid13Png } from './helpers/png';

const CODE = 'hmsf-test';

function makeApp(opts: { frameCode?: string; frameLimit?: number } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'selfie-booth-frames-'));
  const config = loadConfig({
    DATA_DIR: dataDir,
    FRONTEND_ORIGIN: 'https://fe.test',
    ALLOWED_ORIGINS: 'https://fe.test',
    FRAME_UPLOAD_CODE: opts.frameCode ?? CODE,
  });
  const db = openDb(dataDir);
  const app = buildApp({ config, db, frameLimit: opts.frameLimit ?? 20 });
  return { app, cleanup: () => { db.close(); rmSync(dataDir, { recursive: true, force: true }); } };
}

function frameForm(png: Buffer, overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.append('name', 'Hijau');
  form.append('code', CODE);
  form.append('png', new File([png], 'frame.png', { type: 'image/png' }));
  for (const [k, v] of Object.entries(overrides)) form.set(k, v);
  return form;
}

test('POST with the access code stores a measured frame; GET lists and serves it', async () => {
  const { app, cleanup } = makeApp();
  try {
    const res = await app.request('/v1/frames', { method: 'POST', body: frameForm(polaroid13Png()) });
    assert.equal(res.status, 201);
    const created = (await res.json()) as { id: string; name: string; ratio: string; grid: number; inset: Record<string, number>; imageUrl: string };
    assert.match(created.id, /^[A-Za-z0-9]{8}$/);
    assert.equal(created.name, 'Hijau');
    assert.equal(created.ratio, '1:3');
    assert.equal(created.grid, 3);
    assert.deepEqual(created.inset, { top: 143, right: 28, bottom: 240, left: 27 });
    assert.equal(created.imageUrl, `http://localhost/v1/frames/${created.id}/image`);

    const list = await app.request('/v1/frames?ratio=1:3');
    assert.equal(list.status, 200);
    const body = (await list.json()) as { frames: { id: string }[] };
    assert.deepEqual(body.frames.map((f) => f.id), [created.id]);

    const wrongRatio = await app.request(`/v1/frames?ratio=16:9`);
    assert.equal(((await wrongRatio.json()) as { frames: unknown[] }).frames.length, 0);
    assert.equal((await app.request('/v1/frames?ratio=4:3')).status, 400);

    const image = await app.request(created.imageUrl.replace('http://localhost', ''));
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('cache-control'), 'public, max-age=86400, immutable');
    const bytes = Buffer.from(await image.arrayBuffer());
    assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG');
  } finally {
    cleanup();
  }
});

test('uploads without or with a wrong access code are rejected; disabled collection rejects everything', async () => {
  const { app, cleanup } = makeApp();
  try {
    const noCode = await app.request('/v1/frames', { method: 'POST', body: frameForm(polaroid13Png(), { code: '' }) });
    assert.equal(noCode.status, 403);
    const wrongCode = await app.request('/v1/frames', { method: 'POST', body: frameForm(polaroid13Png(), { code: 'guess' }) });
    assert.equal(wrongCode.status, 403);
  } finally {
    cleanup();
  }

  const disabled = makeApp({ frameCode: '' });
  try {
    const res = await disabled.app.request('/v1/frames', { method: 'POST', body: frameForm(polaroid13Png()) });
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { error: string }).error, 'disabled');
  } finally {
    disabled.cleanup();
  }
});

test('invalid frames are rejected: wrong size, opaque canvas, or too many windows', async () => {
  const { app, cleanup } = makeApp();
  try {
    const wrongSize = await app.request('/v1/frames', { method: 'POST', body: frameForm(makeFramePng(100, 100, [{ x: 0, y: 0, w: 50, h: 50 }])) });
    assert.equal(wrongSize.status, 400);
    assert.equal(((await wrongSize.json()) as { error: string }).error, 'invalid_frame');

    const opaque = await app.request('/v1/frames', { method: 'POST', body: frameForm(makeFramePng(640, 1920, [])) });
    assert.equal(opaque.status, 400);

    const fiveWindows = await app.request('/v1/frames', {
      method: 'POST',
      body: frameForm(makeFramePng(640, 1920, [
        { x: 10, y: 100, w: 100, h: 100 },
        { x: 130, y: 100, w: 100, h: 100 },
        { x: 250, y: 100, w: 100, h: 100 },
        { x: 370, y: 100, w: 100, h: 100 },
        { x: 490, y: 100, w: 100, h: 100 },
      ])),
    });
    assert.equal(fiveWindows.status, 400);
  } finally {
    cleanup();
  }
});

test('DELETE requires the access code and removes the frame from the collection', async () => {
  const { app, cleanup } = makeApp();
  try {
    const created = (await (await app.request('/v1/frames', { method: 'POST', body: frameForm(polaroid13Png()) })).json()) as { id: string };
    const url = `/v1/frames/${created.id}`;

    assert.equal((await app.request(url, { method: 'DELETE' })).status, 403);
    assert.equal((await app.request(url, { method: 'DELETE', headers: { 'x-frame-code': 'wrong' } })).status, 403);
    assert.equal((await app.request(url, { method: 'DELETE', headers: { 'x-frame-code': CODE } })).status, 204);

    assert.equal((await app.request(url, { method: 'DELETE', headers: { 'x-frame-code': CODE } })).status, 404);
    const list = (await (await app.request('/v1/frames?ratio=1:3')).json()) as { frames: unknown[] };
    assert.equal(list.frames.length, 0);
    assert.equal((await app.request(`/v1/frames/${created.id}/image`)).status, 404);
  } finally {
    cleanup();
  }
});

test('frame uploads are rate limited independently of design posts', async () => {
  const { app, cleanup } = makeApp({ frameLimit: 1 });
  try {
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    assert.equal((await app.request('/v1/frames', { method: 'POST', body: frameForm(polaroid13Png()), headers })).status, 201);
    assert.equal((await app.request('/v1/frames', { method: 'POST', body: frameForm(polaroid13Png()), headers })).status, 429);
  } finally {
    cleanup();
  }
});
