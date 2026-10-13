// Deployment smoke checks create synthetic designs and delete only those designs.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { createCanvas, loadImage } = require('../server/node_modules/@napi-rs/canvas');
const { decompressFromEncodedURIComponent } = require('lz-string');

const base = process.env.E2E_DEPLOYED_BASE_URL;
const api = process.env.E2E_DEPLOYED_API_URL;
assert.ok(base && api, 'Set E2E_DEPLOYED_BASE_URL and E2E_DEPLOYED_API_URL explicitly');
for (const url of [base, api]) assert.equal(new URL(url).protocol, 'https:');
const origin = new URL(base).origin;
const apiOrigin = new URL(api).origin;
const out = path.join(__dirname, '../.hoplite/artifacts/deployed');
const owned = new Map();
const results = [];
let browser;

async function check(name, fn) {
  await fn();
  results.push({ name, status: 'passed' });
  console.log('PASS', name);
}
async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(30000), cache: 'no-store' });
}
async function until(fn, predicate) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for draft/UI state');
}
async function draft(page) {
  const raw = await page.evaluate(() => localStorage.getItem('selfie-booth:draft:v2'));
  return raw ? JSON.parse(decompressFromEncodedURIComponent(raw.split('|')[0])) : null;
}
async function download(page, button) {
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  assert.equal(await file.failure(), null);
  return fs.readFile(await file.path());
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  await check('API health, frame collection, CORS allowlist and invalid payload', async () => {
    assert.equal((await request(apiOrigin + '/v1/health')).status, 200);
    assert.equal((await (await request(apiOrigin + '/v1/health')).json()).ok, true);
    const frames = await request(apiOrigin + '/v1/frames');
    assert.equal(frames.status, 200);
    assert.ok(Array.isArray((await frames.json()).frames));
    const allowed = await request(apiOrigin + '/v1/designs', {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
    const blocked = await request(apiOrigin + '/v1/designs', {
      method: 'OPTIONS', headers: { Origin: 'https://example.invalid', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
    const form = new FormData();
    form.set('design', '{"v":99}');
    const invalid = await request(apiOrigin + '/v1/designs', { method: 'POST', headers: { Origin: origin }, body: form });
    if (invalid.status === 201) {
      const created = await invalid.json();
      owned.set(created.id, created.deleteToken);
    }
    assert.equal(invalid.status, 400);
  });

  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (response.url() === apiOrigin + '/v1/designs' && response.status() === 201) {
      const data = await response.json();
      owned.set(data.id, data.deleteToken);
    }
  });
  assert.equal((await page.goto(origin)).status(), 200);
  await until(() => draft(page), Boolean);
  const photo = createCanvas(640, 480);
  const ctx = photo.getContext('2d');
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(0, 0, 640, 480);

  await check('Photo upload, edit, draft restore and landscape/strip PNG export', async () => {
    await page.getByRole('group', { name: 'Foto 1', exact: true }).locator('input[type=file]').setInputFiles({
      name: 'deployment-synthetic-photo.png', mimeType: 'image/png', buffer: photo.encodeSync('png'),
    });
    await until(() => draft(page), value => value?.s[0]?.[0]?.startsWith('data:image/jpeg'));
    await page.getByRole('button', { name: 'Perbesar', exact: true }).click();
    await until(() => draft(page), value => value?.s[0]?.[1] === 1.1);
    await page.reload();
    await page.getByRole('button', { name: '1 Foto', exact: true }).click();
    await until(() => draft(page), value => value?.g === 1 && value.s[0][1] === 1.1);
    const button = page.locator('header').getByRole('button', { name: 'Download PNG', exact: true });
    const landscape = await loadImage(await download(page, button));
    assert.deepEqual([landscape.width, landscape.height], [1920, 1080]);
    await page.getByRole('button', { name: 'Photo Strip 1:3' }).click();
    await until(() => draft(page), value => value?.r === '1:3');
    const strip = await loadImage(await download(page, button));
    assert.deepEqual([strip.width, strip.height], [640, 1920]);
  });

  let id;
  await check('Remote sharing, API payload, GIF, viewer, OG image and QR dialog', async () => {
    await page.getByRole('button', { name: 'Polaroid', exact: true }).click();
    await until(() => draft(page), value => value?.f === '/frames/polaroid-1x3.svg');
    await page.locator('header').getByRole('button', { name: 'Bagikan', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Link share' });
    await input.waitFor({ timeout: 45000 });
    const url = new URL(await input.inputValue());
    assert.equal(url.origin, origin);
    assert.match(url.pathname, /^\/s\/[A-Za-z0-9]{8}$/);
    id = url.pathname.split('/').pop();
    await until(async () => owned.has(id), Boolean);
    const saved = await request(apiOrigin + '/v1/designs/' + id);
    assert.equal(saved.status, 200);
    const payload = await saved.json();
    assert.equal(payload.r, '1:3');
    assert.ok(payload.s[0][0].startsWith('data:image/jpeg'));
    const og = await request(apiOrigin + '/v1/designs/' + id + '/og.png');
    assert.equal(og.status, 200);
    assert.match(og.headers.get('content-type'), /image\/png/);
    const artwork = await loadImage(Buffer.from(await og.arrayBuffer()));
    assert.deepEqual([artwork.width, artwork.height], [360, 1080]);
    const sample = createCanvas(360, 1080);
    const pixels = sample.getContext('2d');
    pixels.drawImage(artwork, 0, 0);
    const red = pixels.getImageData(180, 200, 1, 1).data;
    assert.ok(red[0] > 140 && red[1] < 100 && red[2] < 100, 'OG must render the uploaded photo');
    const border = pixels.getImageData(2, 2, 1, 1).data;
    assert.ok(border[0] > 200 && border[1] > 200, 'OG must render the built-in Polaroid border');
    assert.ok(payload.gifUrl, 'Remote GIF must be stored');
    const media = await request(payload.gifUrl);
    assert.equal(media.status, 200);
    assert.match(media.headers.get('content-type'), /image\/gif/);
    assert.equal(Buffer.from(await media.arrayBuffer()).subarray(0, 6).toString(), 'GIF89a');
    const gif = await download(page, page.getByRole('button', { name: 'Download GIF', exact: true }));
    assert.equal(gif.subarray(0, 6).toString(), 'GIF89a');
    const viewer = await context.newPage();
    viewer.on('pageerror', error => errors.push(error.message));
    assert.equal((await viewer.goto(url.href)).status(), 200);
    await viewer.getByRole('link', { name: 'Buka di editor' }).waitFor();
    assert.equal(await viewer.locator('meta[property="og:image"]').getAttribute('content'), apiOrigin + '/v1/designs/' + id + '/og.png');
    await viewer.close();
    await page.getByRole('button', { name: 'Perbesar QR code' }).click();
    await page.getByRole('dialog', { name: 'QR code besar' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog', { name: 'QR code besar' }).count(), 0);
  });

  await check('Mobile share layout, delete-token protection and owned-design deletion', async () => {
    await page.setViewportSize({ width: 320, height: 568 });
    const close = page.getByRole('button', { name: 'Tutup', exact: true });
    const bounds = await close.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 320 && bounds.y + bounds.height <= 568);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const denied = await request(apiOrigin + '/v1/designs/' + id, { method: 'DELETE', headers: { 'X-Delete-Token': 'invalid-test-token' } });
    assert.equal(denied.status, 403);
    await page.getByRole('button', { name: 'Hapus dari server' }).click();
    await page.getByText('Link telah dihapus dari server.', { exact: false }).waitFor();
    assert.equal((await request(apiOrigin + '/v1/designs/' + id)).status, 404);
    owned.delete(id);
    await close.click();
  });

  await check('API outage falls back to an editable hash link', async () => {
    await page.route(apiOrigin + '/v1/designs', route => route.abort());
    await page.locator('header').getByRole('button', { name: 'Bagikan', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Link share' });
    await input.waitFor({ timeout: 45000 });
    const url = new URL(await input.inputValue());
    assert.ok(url.hash.startsWith('#d='));
    const fallback = await context.newPage();
    await fallback.goto(url.href);
    await until(() => draft(fallback), value => value?.s[0]?.[0]?.startsWith('data:image/jpeg'));
    await fallback.close();
    assert.deepEqual(errors, [], 'No browser exceptions allowed');
  });
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();
  await page.screenshot({ path: path.join(out, 'mobile-editor.png'), fullPage: true });
})().catch(error => {
  results.push({ name: 'deployment smoke', status: 'failed', error: error.message });
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
  for (const [id, token] of owned) {
    try {
      const response = await request(apiOrigin + '/v1/designs/' + id, { method: 'DELETE', headers: { 'X-Delete-Token': token } });
      assert.ok(response.status === 204 || response.status === 404, 'Test design cleanup failed');
    } catch (error) {
      console.error('Owned test design cleanup failed:', error.message);
      process.exitCode = 1;
    }
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ base: origin, api: apiOrigin, checkedAt: new Date().toISOString(), results }, null, 2));
});
