import type { BoothState, PhotoSlot, Rect } from './types';
import { boothLayout, placePhoto } from './layout';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const { x, y, w, h } = r;
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function cellRadius(cell: Rect): number {
  return Math.min(12, cell.w * 0.06, cell.h * 0.06);
}

function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cell: Rect, slot: PhotoSlot) {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cell, cellRadius(cell));
  ctx.clip();
  const p = placePhoto(img.naturalWidth, img.naturalHeight, cell, slot);
  ctx.drawImage(img, p.x, p.y, p.w, p.h);
  ctx.restore();
}

/** Render the booth to a canvas at native export size. */
export async function renderBoothCanvas(state: BoothState): Promise<HTMLCanvasElement> {
  const { w, h, cells } = boothLayout(state);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');

  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < state.grid; i++) {
    const slot = state.slots[i];
    const cell = cells[i];
    if (!cell) continue;
    if (!slot?.src) {
      ctx.save();
      ctx.fillStyle = '#161616';
      ctx.beginPath();
      roundRect(ctx, cell, cellRadius(cell));
      ctx.fill();
      ctx.restore();
      continue;
    }
    const img = await loadImage(slot.src);
    drawPhoto(ctx, img, cell, slot);
  }

  if (state.frameSrc) {
    const frame = await loadImage(state.frameSrc);
    ctx.drawImage(frame, 0, 0, w, h);
  }

  return canvas;
}

export async function renderBoothBlob(state: BoothState): Promise<Blob> {
  const canvas = await renderBoothCanvas(state);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal membuat PNG'))), 'image/png');
  });
}
