const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTemplateGuide, downloadTemplateGuide, downloadTemplatePNG, TEMPLATE_BACKGROUND } = require('../.hoplite/test-build/lib/template.js');
const { boothLayout, gridGap, photoInset } = require('../.hoplite/test-build/lib/layout.js');
const { defaultState } = require('../.hoplite/test-build/lib/state.js');

function browser(t, options = {}) {
  const calls = [];
  const downloads = [];
  const blobs = [];
  const ctx = {
    fillRect: (...args) => calls.push(['fillRect', ctx.fillStyle, ...args]),
    clearRect: (...args) => calls.push(['clearRect', ...args]),
  };
  const canvas = {
    getContext: () => options.noContext ? null : ctx,
    toBlob: (callback, type) => callback(options.noBlob ? null : new Blob(['png'], { type })),
  };
  const document = {
    createElement: (tag) => {
      if (tag === 'canvas') return canvas;
      assert.equal(tag, 'a');
      const anchor = { click: () => downloads.push({ filename: anchor.download, href: anchor.href }) };
      return anchor;
    },
    body: { appendChild() {}, removeChild() {} },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  t.after(() => delete globalThis.document);
  t.mock.method(URL, 'createObjectURL', (blob) => { blobs.push(blob); return 'blob:test'; });
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(globalThis, 'setTimeout', (fn) => { fn(); return 0; });
  return { calls, downloads, blobs, canvas, revoke };
}

for (const ratio of ['16:9', '9:16', '1:3']) {
  for (const grid of ratio === '16:9' ? [1, 2, 3, 4] : [1, 2, 3]) {
    test(`guide ${ratio} / ${grid} labels shared geometry without any photo data`, () => {
      const state = { ...defaultState(grid), frameRatio: ratio, frameSrc: null };
      state.slots[0].src = 'data:image/jpeg;base64,private-photo';
      const { w, h, cells } = boothLayout(state);
      const guide = buildTemplateGuide(state);
      assert.ok(guide.includes(`width="${w}" height="${h}"`));
      assert.equal((guide.match(/data-slot=/g) || []).length, grid);
      for (const cell of cells) {
        assert.ok(guide.includes(`x="${cell.x}" y="${cell.y}" width="${cell.w}" height="${cell.h}"`));
        for (const key of ['x', 'y', 'w', 'h']) assert.ok(guide.includes(`${key}=${Math.round(cell[key] * 1000) / 1000}`));
      }
      assert.ok(guide.includes('x="24" y="24"'));
      assert.ok(guide.includes('Area aman: 24 px'));
      assert.ok(guide.includes('bukan bleed cetak'));
      assert.ok(guide.includes('Panduan, bukan bingkai'));
      assert.ok(guide.includes(`Jarak antar foto: ${gridGap(w, h)} px`));
      assert.ok(guide.includes('Foto 1'));
      assert.ok(!guide.includes('private-photo'));
      assert.ok(!guide.includes('<image'));
      const metadata = JSON.parse(guide.match(/<metadata[^>]*>(.*?)<\/metadata>/s)[1]);
      assert.deepEqual(metadata.cells, cells);
      assert.deepEqual(metadata.inset, photoInset(state, w, h));
      assert.equal(metadata.gap, gridGap(w, h));
    });
  }
}

test('guide preserves legacy and custom-template geometry', () => {
  const legacy = { ...defaultState(3), frameRatio: '9:16', layoutVersion: 1 };
  const custom = { ...defaultState(3), frameRatio: '1:3', frameSrc: 'data:image/png;base64,frame', frameGrid: 3, frameInset: { top: 180, right: 24, bottom: 180, left: 24 } };
  for (const state of [legacy, custom]) {
    const metadata = JSON.parse(buildTemplateGuide(state).match(/<metadata[^>]*>(.*?)<\/metadata>/s)[1]);
    assert.deepEqual(metadata.cells, boothLayout(state).cells);
    assert.equal(metadata.layoutVersion, state.layoutVersion);
  }
});

test('SVG download filename includes ratio, grid, design and all four insets', async (t) => {
  const { downloads, blobs, revoke } = browser(t);
  downloadTemplateGuide({ ...defaultState(3), frameRatio: '1:3', frameSrc: '/frames/klasik-1x3.svg' });
  assert.equal(downloads[0].filename, 'selfie-booth-1x3-3-foto-klasik-1x3-inset-180-24-180-24-v2-panduan.svg');
  assert.equal(blobs[0].type, 'image/svg+xml;charset=utf-8');
  assert.ok((await blobs[0].text()).includes('<svg'));
  assert.equal(revoke.mock.callCount(), 1);
});

test('PNG fills borders and gaps uniformly and clears only exact photo windows', async (t) => {
  const { calls, downloads, blobs, canvas } = browser(t);
  const state = { ...defaultState(3), frameRatio: '1:3', frameSrc: '/frames/polaroid-1x3.svg' };
  const { w, h, cells } = boothLayout(state);
  await downloadTemplatePNG(state);
  assert.equal(canvas.width, w);
  assert.equal(canvas.height, h);
  assert.deepEqual(calls, [
    ['fillRect', TEMPLATE_BACKGROUND, 0, 0, w, h],
    ...cells.map(({ x, y, w, h }) => ['clearRect', x, y, w, h]),
  ]);
  assert.equal(blobs[0].type, 'image/png');
  assert.equal(downloads[0].filename, 'selfie-booth-1x3-3-foto-polaroid-1x3-inset-144-28-240-28-v2-dasar.png');
});

test('guide names the base frame and shows the gap and every asymmetric outer inset', () => {
  const state = { ...defaultState(3), frameRatio: '1:3', frameSrc: '/frames/polaroid-1x3.svg' };
  const guide = buildTemplateGuide(state);
  assert.ok(guide.includes('Jarak antar foto: 16 px'));
  assert.ok(guide.includes('Margin luar — atas: 144 px · kanan: 28 px'));
  assert.ok(guide.includes('Margin luar — bawah: 240 px · kiri: 28 px'));
  assert.ok(guide.includes('Bingkai dasar: Polaroid (polaroid-1x3)'));
  const metadata = JSON.parse(guide.match(/<metadata[^>]*>(.*?)<\/metadata>/s)[1]);
  assert.equal(metadata.frameId, 'polaroid-1x3');
});

test('guide uses custom captured margins rather than default padding', () => {
  const state = { ...defaultState(3), frameRatio: '1:3', frameSrc: 'data:image/png;base64,frame', frameInset: { top: 160, right: 26, bottom: 200, left: 30 } };
  const guide = buildTemplateGuide(state);
  assert.ok(guide.includes('Margin luar — atas: 160 px · kanan: 26 px'));
  assert.ok(guide.includes('Margin luar — bawah: 200 px · kiri: 30 px'));
  assert.ok(guide.includes('Bingkai dasar: Kustom'));
});

test('filenames distinguish base designs and custom geometry without exposing image data', async (t) => {
  const { downloads } = browser(t);
  const common = { ...defaultState(3), frameRatio: '1:3' };
  for (const design of ['klasik', 'polaroid', 'neon']) {
    downloadTemplateGuide({ ...common, frameSrc: `/frames/${design}-1x3.svg` });
  }
  downloadTemplateGuide({ ...common, frameSrc: null });
  for (const top of [160, 161]) {
    const custom = { ...common, frameSrc: 'data:image/png;base64,private-frame', frameInset: { top, right: 26, bottom: 200, left: 30 } };
    downloadTemplateGuide(custom);
    await downloadTemplatePNG(custom);
  }
  assert.equal(new Set(downloads.map((item) => item.filename)).size, downloads.length);
  assert.ok(downloads[3].filename.includes('tanpa-bingkai-inset-16-16-16-16'));
  assert.ok(downloads[4].filename.includes('kustom-inset-160-26-200-30'));
  assert.equal(downloads[4].filename.replace('-panduan.svg', ''), downloads[5].filename.replace('-dasar.png', ''));
  assert.ok(downloads.every((item) => !item.filename.includes('private-frame')));
});

test('PNG respects custom captured insets and four-cell landscape order', async (t) => {
  const { calls } = browser(t);
  const state = { ...defaultState(4), frameInset: { top: 120, right: 30, bottom: 160, left: 30 }, frameGrid: 4 };
  await downloadTemplatePNG(state);
  assert.deepEqual(calls.slice(1), boothLayout(state).cells.map(({ x, y, w, h }) => ['clearRect', x, y, w, h]));
});

test('PNG failures reject without triggering a download', async (t) => {
  const stub = browser(t, { noBlob: true });
  await assert.rejects(downloadTemplatePNG(defaultState()), /Gagal membuat template PNG/);
  assert.equal(stub.downloads.length, 0);
});

test('missing Canvas context rejects without triggering a download', async (t) => {
  const stub = browser(t, { noContext: true });
  await assert.rejects(downloadTemplatePNG(defaultState()), /Canvas tidak tersedia/);
  assert.equal(stub.downloads.length, 0);
});
