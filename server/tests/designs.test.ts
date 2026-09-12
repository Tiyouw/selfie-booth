import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { openDb } from '../src/db';
import { expireDesigns } from '../src/expire';

/** 1×1 transparent PNG. */
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
/** 1×1 transparent GIF. */
const GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function makeApp(opts: { postLimit?: number; allowedOrigins?: string } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'selfie-booth-test-'));
  const config = loadConfig({
    DATA_DIR: dataDir,
    TTL_DAYS: '30',
    FRONTEND_ORIGIN: 'https://fe.test',
    ALLOWED_ORIGINS: opts.allowedOrigins ?? 'https://fe.test',
  });
  const db = openDb(dataDir);
  const app = buildApp({ config, db, postLimit: opts.postLimit ?? 20 });
  return { app, config, db, cleanup: () => { db.close(); rmSync(dataDir, { recursive: true, force: true }); } };
}

function payload(overrides: Record<string, unknown> = {}) {
  return { v: 3, g: 2, r: '16:9', f: null, l: 2, s: [[PIXEL, 1, 0, 0], [PIXEL, 1.5, 0.25, -0.5]], ...overrides };
}

function designForm(design: unknown, gif = false): FormData {
  const form = new FormData();
  form.append('design', typeof design === 'string' ? design : JSON.stringify(design));
  if (gif) {
    const bytes = Uint8Array.from(atob(GIF_BASE64), (ch) => ch.charCodeAt(0));
    form.append('gif', new File([bytes], 'strip.gif', { type: 'image/gif' }));
  }
  return form;
}

test('POST → GET returns the identical payload; DELETE with the token removes it', async () => {
  const { app, cleanup } = makeApp();
  try {
    const res = await app.request('/v1/designs', { method: 'POST', body: designForm(payload()) });
    assert.equal(res.status, 201);
    const created = await res.json() as { id: string; url: string; expiresAt: number; deleteToken: string; gifUrl?: string };
    assert.match(created.id, /^[A-Za-z0-9]{8}$/);
    assert.equal(created.url, `https://fe.test/s/${created.id}`);
    assert.ok(created.deleteToken.length === 32);
    assert.ok(created.expiresAt > Math.floor(Date.now() / 1000));

    const fetched = await app.request(`/v1/designs/${created.id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.deepEqual(await fetched.json(), payload());

    const wrong = await app.request(`/v1/designs/${created.id}`, {
      method: 'DELETE',
      headers: { 'x-delete-token': 'f'.repeat(32) },
    });
    assert.equal(wrong.status, 403);
    const noToken = await app.request(`/v1/designs/${created.id}`, { method: 'DELETE' });
    assert.equal(noToken.status, 403);

    const del = await app.request(`/v1/designs/${created.id}`, {
      method: 'DELETE',
      headers: { 'x-delete-token': created.deleteToken },
    });
    assert.equal(del.status, 204);
    assert.equal((await app.request(`/v1/designs/${created.id}`)).status, 404);
  } finally {
    cleanup();
  }
});

test('short links follow the allowlisted requesting origin (multi-domain booths)', async () => {
  const { app, cleanup } = makeApp({ allowedOrigins: 'https://fe.test,https://photobooth.org.test' });
  try {
    const res = await app.request('/v1/designs', {
      method: 'POST',
      body: designForm(payload()),
      headers: { origin: 'https://photobooth.org.test' },
    });
    assert.equal(res.status, 201);
    const created = await res.json() as { id: string; url: string };
    assert.equal(created.url, `https://photobooth.org.test/s/${created.id}`);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://photobooth.org.test');

    const noOrigin = await app.request('/v1/designs', { method: 'POST', body: designForm(payload()) });
    const fallback = await noOrigin.json() as { url: string };
    assert.ok(fallback.url.startsWith('https://fe.test/s/'));

    const foreign = await app.request('/v1/designs', {
      method: 'POST',
      body: designForm(payload()),
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(foreign.status, 201); // non-browser clients can POST; browsers cannot read this response
    const foreignBody = await foreign.json() as { url: string };
    assert.ok(foreignBody.url.startsWith('https://fe.test/s/'));
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  } finally {
    cleanup();
  }
});

test('invalid payloads are rejected with a clear error, never stored silently', async () => {
  const { app, cleanup } = makeApp();
  try {
    for (const design of [payload({ v: 99 }), 'not json', '"a plain json string"']) {
      const res = await app.request('/v1/designs', { method: 'POST', body: designForm(design) });
      assert.equal(res.status, 400);
    }
    const missing = await app.request('/v1/designs', { method: 'POST', body: new FormData() });
    assert.equal(missing.status, 400);
  } finally {
    cleanup();
  }
});

test('gif upload is stored and served with the gif content type', async () => {
  const { app, cleanup } = makeApp();
  try {
    const res = await app.request('/v1/designs', { method: 'POST', body: designForm(payload(), true) });
    assert.equal(res.status, 201);
    const created = await res.json() as { id: string; gifUrl: string };
    assert.ok(created.gifUrl.endsWith(`/v1/media/${created.id}.gif`));

    const fetched = await app.request(`/v1/designs/${created.id}`);
    const body = await fetched.json() as { gifUrl?: string };
    assert.equal(body.gifUrl, created.gifUrl);

    const media = await app.request(new URL(created.gifUrl).pathname);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'image/gif');
    const bytes = Buffer.from(await media.arrayBuffer());
    assert.equal(bytes.subarray(0, 6).toString('latin1'), 'GIF89a');

    const wrongName = await app.request(`/v1/media/${created.id}.png`);
    assert.equal(wrongName.status, 404);
  } finally {
    cleanup();
  }
});

test('og.png renders the strip for builtin SVG frames and custom data-URL frames', async () => {
  const { app, cleanup } = makeApp();
  try {
    for (const frameSrc of ['/frames/klasik-16x9.svg', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==']) {
      const res = await app.request('/v1/designs', {
        method: 'POST',
        body: designForm(payload({ g: 3, r: '16:9', f: frameSrc })),
      });
      assert.equal(res.status, 201);
      const { id } = await res.json() as { id: string };
      const og = await app.request(`/v1/designs/${id}/og.png`);
      assert.equal(og.status, 200);
      assert.equal(og.headers.get('content-type'), 'image/png');
      const bytes = Buffer.from(await og.arrayBuffer());
      assert.equal(bytes.subarray(0, 4).toString('latin1'), '\x89PNG');
      assert.ok(bytes.length > 1000);
    }
  } finally {
    cleanup();
  }
});

test('expired designs answer 410 and expireDesigns removes rows and blobs', async (t) => {
  const { app, config, db, cleanup } = makeApp();
  t.after(cleanup);
  const res = await app.request('/v1/designs', { method: 'POST', body: designForm(payload(), true) });
  const created = await res.json() as { id: string };
  const past = Math.floor(Date.now() / 1000) - 1;
  db.prepare('UPDATE designs SET expires_at = ? WHERE id = ?').run(past, created.id);

  assert.equal((await app.request(`/v1/designs/${created.id}`)).status, 410);
  assert.equal((await app.request(`/v1/designs/${created.id}/og.png`)).status, 410);
  assert.equal((await app.request(`/v1/media/${created.id}.gif`)).status, 404);

  assert.equal(expireDesigns(db, config.dataDir), 1);
  assert.equal((await app.request(`/v1/designs/${created.id}`)).status, 404);
  await assert.rejects(readFile(join(config.dataDir, 'blobs', `${created.id}.gif`)));
});

test('POST is rate limited per IP', async () => {
  const { app, cleanup } = makeApp({ postLimit: 2 });
  try {
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    assert.equal((await app.request('/v1/designs', { method: 'POST', body: designForm(payload()), headers })).status, 201);
    assert.equal((await app.request('/v1/designs', { method: 'POST', body: designForm(payload()), headers })).status, 201);
    const limited = await app.request('/v1/designs', { method: 'POST', body: designForm(payload()), headers });
    assert.equal(limited.status, 429);
    // A different IP still passes.
    assert.equal((await app.request('/v1/designs', { method: 'POST', body: designForm(payload()), headers: { 'x-forwarded-for': '198.51.100.7' } })).status, 201);
  } finally {
    cleanup();
  }
});

test('CORS: only allowlisted origins receive ACAO headers', async () => {
  const { app, cleanup } = makeApp({ allowedOrigins: 'https://fe.test,https://preview.vercel.app' });
  try {
    const allowed = await app.request('/v1/health', { headers: { origin: 'https://fe.test' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://fe.test');
    const denied = await app.request('/v1/health', { headers: { origin: 'https://evil.example' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);

    const preflight = await app.request('/v1/designs', {
      method: 'OPTIONS',
      headers: { origin: 'https://preview.vercel.app', 'access-control-request-method': 'DELETE', 'access-control-request-headers': 'x-delete-token' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://preview.vercel.app');
    assert.ok((preflight.headers.get('access-control-allow-headers') ?? '').includes('X-Delete-Token'));
  } finally {
    cleanup();
  }
});

test('malformed ids and unknown routes answer 404 without touching the db', async () => {
  const { app, cleanup } = makeApp();
  try {
    for (const id of ['short', 'toolong12345678', '../../etc/passwd', 'a'.repeat(8)]) {
      assert.equal((await app.request(`/v1/designs/${id}`)).status, 404);
    }
    assert.equal((await app.request('/v2/designs')).status, 404);
    assert.equal((await app.request('/v1/health')).status, 200);
  } finally {
    cleanup();
  }
});
