import { createCanvas } from '@napi-rs/canvas';

/** Builds a real PNG of the given size: opaque `color` background with fully transparent window rectangles. */
export function makeFramePng(
  w: number,
  h: number,
  windows: { x: number; y: number; w: number; h: number }[],
  color = '#22aa44',
): Buffer {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  for (const win of windows) ctx.clearRect(win.x, win.y, win.w, win.h);
  return canvas.encodeSync('png');
}

/** Polaroid-1:3-shaped frame: three 585×502 windows like the measured Hijau.png. */
export function polaroid13Png(): Buffer {
  return makeFramePng(640, 1920, [
    { x: 27, y: 143, w: 585, h: 502 },
    { x: 27, y: 661, w: 585, h: 502 },
    { x: 27, y: 1178, w: 585, h: 502 },
  ]);
}
