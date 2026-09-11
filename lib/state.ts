import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { BoothState, FrameRatio, GridCount, Inset, PhotoSlot } from './types';
import { DEFAULT_FRAME, isBuiltinFrame } from './frames';
import { MAX_ZOOM, MIN_ZOOM, clamp, exportSize, gridGap, gridLayout } from './layout';

export const MAX_GRID: GridCount = 4;

/**
 * `slots` always holds MAX_GRID entries; only the first `grid` are shown.
 * Switching 4 → 1 → 4 therefore brings the hidden photos back.
 */
export function makeSlots(): PhotoSlot[] {
  return Array.from({ length: MAX_GRID }, (_, i) => ({
    id: `slot-${i}`,
    src: null,
    zoom: 1,
    ox: 0,
    oy: 0,
  }));
}

export function defaultState(grid: GridCount = 3): BoothState {
  return {
    grid,
    frameSrc: DEFAULT_FRAME.src,
    frameRatio: DEFAULT_FRAME.ratio,
    layoutVersion: 2,
    slots: makeSlots(),
  };
}

export function visibleSlots(state: BoothState): PhotoSlot[] {
  return state.slots.slice(0, state.grid);
}

export function hasPhotos(state: BoothState): boolean {
  return visibleSlots(state).some((s) => !!s.src);
}

/** Serialize state into a compact URL-safe string. Hidden slots are dropped. */
export function encodeState(state: BoothState): string {
  return compressToEncodedURIComponent(JSON.stringify(buildPayload(state, visibleSlots(state))));
}

/**
 * Share/API payload object for the given slots (pre-compression).
 * Used by the hash provider and by the remote share API (docs/SHARE_BACKEND.md).
 */
export function buildPayload(state: BoothState, slots: PhotoSlot[]): Record<string, unknown> {
  return {
    v: 3,
    g: state.grid,
    f: state.frameSrc,
    r: state.frameRatio,
    l: state.layoutVersion ?? 1,
    i: state.frameInset && [state.frameInset.top, state.frameInset.right, state.frameInset.bottom, state.frameInset.left],
    k: state.frameGrid,
    s: slots.map((s) => [s.src, round(s.zoom), round(s.ox), round(s.oy)]),
  };
}

function encodePayload(state: BoothState, slots: PhotoSlot[]): string {
  return compressToEncodedURIComponent(JSON.stringify(buildPayload(state, slots)));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function isPhotoSrc(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/');
}

function validGrid(value: unknown, ratio: FrameRatio, fallback: GridCount = 3): GridCount {
  return clamp(Math.round(num(value, fallback)), 1, ratio === '16:9' ? MAX_GRID : 3) as GridCount;
}

function sanitizeInset(raw: unknown, ratio: FrameRatio, grid: GridCount, version: 1 | 2): Inset | undefined {
  if (!Array.isArray(raw) || raw.length !== 4 || raw.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) return;
  const [top, right, bottom, left] = raw as number[];
  const inset = { top, right, bottom, left };
  const { w, h } = exportSize(ratio);
  const cells = gridLayout(grid, w, h, inset, gridGap(w, h), w < h, version);
  return cells.every((cell) => cell.w > 0 && cell.h > 0) ? inset : undefined;
}

/** Deserialize a compact string back into a validated BoothState. */
export function decodeState(str: string): BoothState | null {
  try {
    const json = decompressFromEncodedURIComponent(str);
    if (!json) return null;
    return sanitizeState(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Validate untrusted payload (share link / localStorage) into a safe state. */
export function sanitizeState(p: unknown): BoothState | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  if (o.v !== undefined && o.v !== 1 && o.v !== 2 && o.v !== 3) return null;
  const frameRatio: FrameRatio = o.r === '1:3' ? '1:3' : o.r === '9:16' ? '9:16' : '16:9';
  const grid = validGrid(o.g, frameRatio);
  const layoutVersion = o.v === 3 && o.l === 2 ? 2 : 1;

  let frameSrc: string | null = null;
  if (typeof o.f === 'string') {
    if (o.f.startsWith('data:image/png') || isBuiltinFrame(o.f)) frameSrc = o.f;
  }

  const raw = Array.isArray(o.s) ? (o.s as unknown[]) : [];
  const slots = makeSlots().map((empty, i) => {
    const a = raw[i];
    if (!Array.isArray(a)) return empty;
    return {
      ...empty,
      src: isPhotoSrc(a[0]) ? a[0] : null,
      zoom: clamp(num(a[1], 1), MIN_ZOOM, MAX_ZOOM),
      ox: clamp(num(a[2], 0), -1, 1),
      oy: clamp(num(a[3], 0), -1, 1),
    };
  });

  const state: BoothState = { grid, frameSrc, frameRatio, layoutVersion, slots };
  if (o.v === 3) {
    const frameInset = sanitizeInset(o.i, frameRatio, grid, layoutVersion);
    if (frameInset) state.frameInset = frameInset;
    if (typeof o.k === 'number' && Number.isInteger(o.k) && o.k >= 1 && o.k <= (frameRatio === '16:9' ? 4 : 3)) {
      state.frameGrid = o.k as GridCount;
    }
  }
  return state;
}

const STORAGE_KEY = 'selfie-booth:draft:v2';

export function saveDraft(state: BoothState): boolean {
  try {
    // keep hidden slots in the local draft (unlike share links)
    localStorage.setItem(STORAGE_KEY, encodePayload(state, state.slots.slice(0, MAX_GRID)));
    return true;
  } catch {
    // quota exceeded — draft simply isn't persisted
    return false;
  }
}

export function loadDraft(): BoothState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const [payload, g] = raw.split('|');
    const state = decodeState(payload);
    if (!state) return null;
    const grid = g === undefined ? state.grid : validGrid(Number(g), state.frameRatio, state.grid);
    return { ...state, grid };
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
