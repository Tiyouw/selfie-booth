import type { BoothState, FrameRatio, Rect } from './types';
import { boothLayout, exportSize } from './layout';
import { cellRadius, drawEmptyCell, drawPhoto, loadImage } from './render';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';

/** GIF long-side resolution — sharp enough for chat, small enough to share. */
export const GIF_LONG_SIDE = 480;

/** Which photos are revealed so far, and how long the frame is shown. */
export interface GifFrameSpec {
  photoCount: number;
  delayMs: number;
}

/**
 * Frame plan for an animated strip: photos appear one by one in slot order,
 * then the finished strip is held before the loop restarts.
 */
export function gifTimeline(filledCount: number): GifFrameSpec[] {
  if (!Number.isInteger(filledCount) || filledCount < 1) {
    throw new Error('GIF butuh minimal satu foto.');
  }
  const frames: GifFrameSpec[] = [{ photoCount: 0, delayMs: 400 }];
  for (let i = 1; i <= filledCount; i++) frames.push({ photoCount: i, delayMs: 600 });
  frames.push({ photoCount: filledCount, delayMs: 2000 });
  return frames;
}

/** GIF canvas size for a ratio, keeping aspect at `longSide` on the long edge. */
export function gifSize(ratio: FrameRatio, longSide = GIF_LONG_SIDE): { w: number; h: number } {
  const native = exportSize(ratio);
  const scale = longSide / Math.max(native.w, native.h);
  return { w: Math.round(native.w * scale), h: Math.round(native.h * scale) };
}

/**
 * Encode the booth as an animated GIF: photos appear one by one inside the
 * frame, then the completed strip is held. Client-side only (DOM canvas).
 */
export async function renderBoothGifBlob(state: BoothState, opts: { longSide?: number } = {}): Promise<Blob> {
  const visible = state.slots.slice(0, state.grid);
  const filled = visible.flatMap((slot, i) => (slot.src ? [i] : []));
  if (!filled.length) throw new Error('GIF butuh minimal satu foto.');

  const longSide = opts.longSide ?? GIF_LONG_SIDE;
  const size = gifSize(state.frameRatio, longSide);
  const native = boothLayout(state);
  const scale = size.w / native.w;

  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');

  const imgs = await Promise.all(visible.map((slot) => (slot.src ? loadImage(slot.src) : null)));
  const frame = state.frameSrc ? await loadImage(state.frameSrc).catch(() => null) : null;

  // Scale native geometry so the GIF matches the PNG export proportionally.
  const cells: Rect[] = native.cells.map((c) => ({
    x: c.x * scale,
    y: c.y * scale,
    w: c.w * scale,
    h: c.h * scale,
  }));
  const radii = native.cells.map((c) => cellRadius(c) * scale);

  const encoder = GIFEncoder();
  for (const spec of gifTimeline(filled.length)) {
    const revealed = new Set(filled.slice(0, spec.photoCount));
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, size.w, size.h);
    visible.forEach((slot, i) => {
      const cell = cells[i];
      if (!cell) return;
      if (revealed.has(i) && imgs[i]) drawPhoto(ctx, imgs[i], cell, slot, radii[i]);
      else drawEmptyCell(ctx, cell, radii[i]);
    });
    if (frame) ctx.drawImage(frame, 0, 0, size.w, size.h);

    const { data } = ctx.getImageData(0, 0, size.w, size.h);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    encoder.writeFrame(index, size.w, size.h, { palette, delay: spec.delayMs });
    // Yield between frames so the UI stays responsive during encode.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  encoder.finish();
  const bytes = encoder.bytes();
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'image/gif',
  });
}
