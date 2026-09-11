import { createCanvas, loadImage, type Image as CanvasImage, type SKRSContext2D } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { BoothState, Rect } from '../../lib/types';
import { boothLayout, placePhoto } from '../../lib/layout';
import { isBuiltinFrame } from '../../lib/frames';

/** public/frames at the repo root (server lives in the same repo). */
const FRAME_ROOT = join(dirname(__dirname), '..', '..', 'public', 'frames');

function roundRectPath(ctx: SKRSContext2D, r: Rect, radius: number) {
  const { x, y, w, h } = r;
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function loadImageAny(src: string): Promise<CanvasImage | null> {
  try {
    if (src.startsWith('data:image/')) {
      const base64 = src.slice(src.indexOf(',') + 1);
      return await loadImage(Buffer.from(base64, 'base64'));
    }
    if (isBuiltinFrame(src)) {
      // Built-in frames are repo assets under public/frames/.
      return await loadImage(await readFile(join(FRAME_ROOT, basename(src))));
    }
  } catch {
    // A missing/undecodable asset degrades the OG render, never the design.
    return null;
  }
  return null;
}

/**
 * Server-side strip render (OG/WhatsApp preview), mirroring lib/render.ts:
 * dark background → cells with photos / empty fill → frame overlay.
 */
export async function renderOgPng(state: BoothState, longSide = 1080): Promise<Buffer> {
  const native = boothLayout(state);
  const scale = longSide / Math.max(native.w, native.h);
  const canvas = createCanvas(Math.round(native.w * scale), Math.round(native.h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cells: Rect[] = native.cells.map((c) => ({
    x: c.x * scale,
    y: c.y * scale,
    w: c.w * scale,
    h: c.h * scale,
  }));

  for (let i = 0; i < state.grid; i++) {
    const slot = state.slots[i];
    const cell = cells[i];
    if (!cell) continue;
    const radius = Math.min(12, cell.w * 0.06, cell.h * 0.06);
    if (!slot?.src) {
      ctx.save();
      ctx.fillStyle = '#161616';
      ctx.beginPath();
      roundRectPath(ctx, cell, radius);
      ctx.fill();
      ctx.restore();
      continue;
    }
    const img = await loadImageAny(slot.src);
    if (!img) continue;
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, cell, radius);
    ctx.clip();
    const p = placePhoto(img.width, img.height, cell, slot);
    ctx.drawImage(img, p.x, p.y, p.w, p.h);
    ctx.restore();
  }

  if (state.frameSrc) {
    const frame = await loadImageAny(state.frameSrc);
    if (frame) ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  }

  return canvas.toBuffer('image/png');
}
