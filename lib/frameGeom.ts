import type { Inset, Rect } from './types';

/** Alpha below this counts as a transparent photo window. */
const ALPHA_MAX = 16;

/**
 * Bounding boxes of the sizeable fully-transparent regions in an RGBA buffer —
 * the photo windows of an uploaded frame — sorted top-to-bottom, then
 * left-to-right. Small stray transparent pixels (holes in decoration, dots)
 * are ignored via a minimum-area threshold.
 */
export function detectTransparentWindows(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  opts: { minArea?: number; alphaMax?: number } = {},
): Rect[] {
  const alphaMax = opts.alphaMax ?? ALPHA_MAX;
  const minArea = opts.minArea ?? Math.floor(w * h * 0.005);
  const seen = new Uint8Array(w * h);
  const windows: Array<Rect & { area: number }> = [];
  const stack: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (seen[start] || rgba[start * 4 + 3] > alphaMax) continue;
      stack.length = 0;
      stack.push(start);
      seen[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      while (stack.length) {
        const p = stack.pop() as number;
        const px = p % w;
        const py = (p - px) / w;
        area++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        if (px > 0 && !seen[p - 1] && rgba[(p - 1) * 4 + 3] <= alphaMax) {
          seen[p - 1] = 1;
          stack.push(p - 1);
        }
        if (px < w - 1 && !seen[p + 1] && rgba[(p + 1) * 4 + 3] <= alphaMax) {
          seen[p + 1] = 1;
          stack.push(p + 1);
        }
        if (py > 0 && !seen[p - w] && rgba[(p - w) * 4 + 3] <= alphaMax) {
          seen[p - w] = 1;
          stack.push(p - w);
        }
        if (py < h - 1 && !seen[p + w] && rgba[(p + w) * 4 + 3] <= alphaMax) {
          seen[p + w] = 1;
          stack.push(p + w);
        }
      }
      if (area >= minArea) windows.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
    }
  }
  windows.sort((a, b) => a.y - b.y || a.x - b.x);
  return windows;
}

/**
 * Inset that reproduces the given windows through the app's grid layout:
 * the union bounding box of all windows, expressed as canvas margins.
 */
export function insetFromWindows(windows: Rect[], w: number, h: number): Inset | null {
  if (windows.length === 0) return null;
  const left = Math.min(...windows.map((r) => r.x));
  const top = Math.min(...windows.map((r) => r.y));
  const right = w - Math.max(...windows.map((r) => r.x + r.w));
  const bottom = h - Math.max(...windows.map((r) => r.y + r.h));
  return { top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom), left: Math.round(left) };
}
