import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { BoothState, FrameRatio, GridCount, PhotoSlot } from './types';
import { DEFAULT_FRAME, isBuiltinFrame } from './frames';
import { MAX_ZOOM, MIN_ZOOM, clamp } from './layout';

export const MAX_GRID: GridCount = 3;

/**
 * `slots` always holds MAX_GRID entries; only the first `grid` are shown.
 * Switching 3 → 1 → 3 therefore brings the hidden photos back.
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
  const payload = {
    v: 2,
    g: state.grid,
    f: state.frameSrc,
    r: state.frameRatio,
    s: visibleSlots(state).map((s) => [s.src, round(s.zoom), round(s.ox), round(s.oy)]),
  };
  return compressToEncodedURIComponent(JSON.stringify(payload));
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
  const grid = clamp(Math.round(num(o.g, 3)), 1, MAX_GRID) as GridCount;
  const frameRatio: FrameRatio = o.r === '9:16' ? '9:16' : '16:9';

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

  return { grid, frameSrc, frameRatio, slots };
}

const STORAGE_KEY = 'selfie-booth:draft:v2';

export function saveDraft(state: BoothState): boolean {
  try {
    // keep hidden slots in the local draft (unlike share links)
    localStorage.setItem(STORAGE_KEY, encodeState({ ...state, grid: MAX_GRID }) + `|${state.grid}`);
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
    const grid = clamp(Math.round(num(Number(g), MAX_GRID)), 1, MAX_GRID) as GridCount;
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
