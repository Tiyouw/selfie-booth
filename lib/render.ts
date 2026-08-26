import type { BoothState, GridCount, PhotoSlot } from './types';

const EXPORT_SCALE = 3; // 3x for crisp PNG export

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Layout geometry for a given grid count inside a (w x h) canvas. */
export function gridLayout(
  grid: GridCount,
  w: number,
  h: number,
  gap: number,
  isPortrait = false,
) {
  const pad = gap;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const cells: { x: number; y: number; w: number; h: number }[] = [];

  if (grid === 1) {
    cells.push({ x: pad, y: pad, w: innerW, h: innerH });
    return cells;
  }

  if (isPortrait) {
    // Portrait (9:16): photos stack top-to-bottom.
    const rows = grid === 2 ? 2 : 3;
    const cellH = (innerH - gap * (rows - 1)) / rows;
    if (grid === 2) {
      for (let i = 0; i < 2; i++) {
        cells.push({ x: pad, y: pad + i * (cellH + gap), w: innerW, h: cellH });
      }
    } else {
      // 3 photos: top spans full width, bottom split into 2 columns
      const topH = cellH;
      const bottomH = innerH - topH - gap;
      const cellW = (innerW - gap) / 2;
      cells.push({ x: pad, y: pad, w: innerW, h: topH });
      cells.push({ x: pad, y: pad + topH + gap, w: cellW, h: bottomH });
      cells.push({ x: pad + cellW + gap, y: pad + topH + gap, w: cellW, h: bottomH });
    }
    return cells;
  }

  // Landscape (16:9): photos side-by-side.
  const cols = grid === 2 ? 2 : 2; // 2 and 3 both use 2 columns
  const rows = grid === 2 ? 1 : 2;
  const cellW = (innerW - gap * (cols - 1)) / cols;
  const cellH = (innerH - gap * (rows - 1)) / rows;

  if (grid === 2) {
    for (let i = 0; i < 2; i++) {
      cells.push({ x: pad + i * (cellW + gap), y: pad, w: cellW, h: innerH });
    }
  } else {
    // 3 photos: left tall (spans 2 rows), right top, right bottom
    cells.push({ x: pad, y: pad, w: cellW, h: innerH });
    cells.push({ x: pad + cellW + gap, y: pad, w: cellW, h: cellH });
    cells.push({
      x: pad + cellW + gap,
      y: pad + cellH + gap,
      w: cellW,
      h: cellH,
    });
  }
  return cells;
}

/** Draw a single photo into a cell with cover-fit + zoom + offset. */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cell: { x: number; y: number; w: number; h: number },
  slot: PhotoSlot,
) {
  const cx = cell.x;
  const cy = cell.y;
  const cw = cell.w;
  const ch = cell.h;

  ctx.save();
  // clip to rounded rectangle
  const r = Math.min(12, cw * 0.06);
  ctx.beginPath();
  roundRect(ctx, cx, cy, cw, ch, r);
  ctx.clip();

  // cover fit
  const scale = Math.max(cw / img.width, ch / img.height) * slot.zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  // center, then apply offset (ox/oy in fraction of overflow)
  let dx = cx + (cw - dw) / 2;
  let dy = cy + (ch - dh) / 2;
  const overX = Math.max(0, (dw - cw) / 2);
  const overY = Math.max(0, (dh - ch) / 2);
  dx -= overX * slot.ox;
  dy -= overY * slot.oy;

  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Render the full booth to a canvas and return a PNG dataURL.
 * The output aspect follows the frame ratio if a frame is set.
 */
export async function renderBooth(state: BoothState): Promise<string> {
  const isPortrait = state.frameRatio === '9:16';
  const W = isPortrait ? 1080 : 1920;
  const H = isPortrait ? 1920 : 1080;

  const canvas = document.createElement('canvas');
  canvas.width = W * EXPORT_SCALE;
  canvas.height = H * EXPORT_SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);

  // background
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  const gap = Math.round(Math.min(W, H) * 0.025);
  const cells = gridLayout(state.grid, W, H, gap, isPortrait);

  // draw photos
  for (let i = 0; i < state.slots.length; i++) {
    const slot = state.slots[i];
    const cell = cells[i];
    if (!slot || !slot.src || !cell) continue;
    try {
      const img = await loadImage(slot.src);
      drawPhoto(ctx, img, cell, slot);
    } catch {
      // draw placeholder
      ctx.save();
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      ctx.restore();
    }
  }

  // draw frame overlay on top
  if (state.frameSrc) {
    try {
      const frame = await loadImage(state.frameSrc);
      ctx.drawImage(frame, 0, 0, W, H);
    } catch {
      /* ignore */
    }
  }

  return canvas.toDataURL('image/png');
}
