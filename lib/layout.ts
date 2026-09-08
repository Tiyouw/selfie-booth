import type { BoothState, FrameRatio, GridCount, Inset, PhotoSlot, Rect } from './types';
import { findBuiltinFrame } from './frames';

/** Native export size. Photos are stored at ≤1280px so 1× is already full quality. */
export function exportSize(ratio: FrameRatio): { w: number; h: number } {
  return ratio === '9:16' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
}

/** Gap between photos (and default edge padding), relative to the short side. */
export function gridGap(w: number, h: number): number {
  return Math.round(Math.min(w, h) * 0.025);
}

/** Area the photos are laid out in: the frame's transparent window or the default padding. */
export function photoInset(state: BoothState, w: number, h: number): Inset {
  const builtin = findBuiltinFrame(state.frameSrc);
  if (builtin) return builtin.inset;
  const g = gridGap(w, h);
  return { top: g, right: g, bottom: g, left: g };
}

/** Cell geometry for a grid inside the inset area of a (w × h) canvas. */
export function gridLayout(
  grid: GridCount,
  w: number,
  h: number,
  inset: Inset,
  gap: number,
  isPortrait: boolean,
): Rect[] {
  const x0 = inset.left;
  const y0 = inset.top;
  const innerW = w - inset.left - inset.right;
  const innerH = h - inset.top - inset.bottom;
  const cells: Rect[] = [];

  if (grid === 1) {
    cells.push({ x: x0, y: y0, w: innerW, h: innerH });
    return cells;
  }

  if (isPortrait) {
    if (grid === 2) {
      const cellH = (innerH - gap) / 2;
      cells.push({ x: x0, y: y0, w: innerW, h: cellH });
      cells.push({ x: x0, y: y0 + cellH + gap, w: innerW, h: cellH });
    } else {
      // top photo spans the width; two below it
      const topH = (innerH - gap) * 0.55;
      const bottomH = innerH - topH - gap;
      const cellW = (innerW - gap) / 2;
      cells.push({ x: x0, y: y0, w: innerW, h: topH });
      cells.push({ x: x0, y: y0 + topH + gap, w: cellW, h: bottomH });
      cells.push({ x: x0 + cellW + gap, y: y0 + topH + gap, w: cellW, h: bottomH });
    }
    return cells;
  }

  const cellW = (innerW - gap) / 2;
  if (grid === 2) {
    cells.push({ x: x0, y: y0, w: cellW, h: innerH });
    cells.push({ x: x0 + cellW + gap, y: y0, w: cellW, h: innerH });
  } else {
    // left photo spans the height; two stacked on the right
    const cellH = (innerH - gap) / 2;
    cells.push({ x: x0, y: y0, w: cellW, h: innerH });
    cells.push({ x: x0 + cellW + gap, y: y0, w: cellW, h: cellH });
    cells.push({ x: x0 + cellW + gap, y: y0 + cellH + gap, w: cellW, h: cellH });
  }
  return cells;
}

/** Full layout for a state at export resolution. */
export function boothLayout(state: BoothState): { w: number; h: number; cells: Rect[] } {
  const { w, h } = exportSize(state.frameRatio);
  const inset = photoInset(state, w, h);
  const cells = gridLayout(state.grid, w, h, inset, gridGap(w, h), state.frameRatio === '9:16');
  return { w, h, cells };
}

/**
 * Cover-fit + zoom + offset placement of an image inside a cell.
 * Used by both the canvas export and the CSS preview so they match exactly.
 */
export function placePhoto(
  imgW: number,
  imgH: number,
  cell: Rect,
  slot: Pick<PhotoSlot, 'zoom' | 'ox' | 'oy'>,
): Rect & { overX: number; overY: number } {
  const scale = Math.max(cell.w / imgW, cell.h / imgH) * slot.zoom;
  const dw = imgW * scale;
  const dh = imgH * scale;
  const overX = Math.max(0, (dw - cell.w) / 2);
  const overY = Math.max(0, (dh - cell.h) / 2);
  const dx = cell.x + (cell.w - dw) / 2 - overX * slot.ox;
  const dy = cell.y + (cell.h - dh) / 2 - overY * slot.oy;
  return { x: dx, y: dy, w: dw, h: dh, overX, overY };
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
