import type { FrameRatio, GridCount, Inset } from './types';

/**
 * Custom frames saved on this device. Unlike the working draft, the library
 * is meant to survive refreshes and "Mulai baru" — upload once, pick anytime.
 * See docs/TEMPLATES.md.
 */
export interface SavedFrame {
  id: string;
  name: string;
  /** PNG dataURL at export size. */
  src: string;
  ratio: FrameRatio;
  grid: GridCount;
  /** Measured transparent-window geometry (lib/frameGeom), if detectable. */
  inset: Inset | null;
  createdAt: number;
}

const KEY = 'selfie-booth:frames:v1';
const RATIOS: readonly string[] = ['16:9', '9:16', '1:3'];

/** localStorage ceiling for the library (photos stay in the draft, not here). */
export const MAX_SAVED_FRAMES = 12;

function sanitizeInset(v: unknown): Inset | null {
  if (!v || typeof v !== 'object') return null;
  const i = v as Partial<Inset>;
  if (![i.top, i.right, i.bottom, i.left].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { top: i.top as number, right: i.right as number, bottom: i.bottom as number, left: i.left as number };
}

function isValidEntry(v: unknown): v is SavedFrame {
  if (!v || typeof v !== 'object') return false;
  const f = v as Partial<SavedFrame>;
  return (
    typeof f.id === 'string' &&
    typeof f.name === 'string' &&
    typeof f.src === 'string' &&
    f.src.startsWith('data:image/png;base64,') &&
    RATIOS.includes(f.ratio ?? '') &&
    [1, 2, 3, 4].includes(f.grid ?? 0) &&
    typeof f.createdAt === 'number'
  );
}

export function loadFrameLibrary(): SavedFrame[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidEntry)
      .map((f) => ({ ...f, inset: sanitizeInset(f.inset) }))
      .slice(0, MAX_SAVED_FRAMES);
  } catch {
    return [];
  }
}

export function saveFrameLibrary(frames: SavedFrame[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(frames.slice(0, MAX_SAVED_FRAMES)));
    return true;
  } catch {
    return false;
  }
}

/** Add a frame (a same-src upload refreshes that entry). Returns the new list and whether it persisted. */
export function addFrameToLibrary(
  frame: Omit<SavedFrame, 'id' | 'createdAt'>,
): { frames: SavedFrame[]; saved: boolean } {
  const entry: SavedFrame = {
    ...frame,
    id: `frame-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  };
  const frames = [entry, ...loadFrameLibrary().filter((f) => f.src !== frame.src)].slice(0, MAX_SAVED_FRAMES);
  return { frames, saved: saveFrameLibrary(frames) };
}

export function removeFrameFromLibrary(id: string): SavedFrame[] {
  const frames = loadFrameLibrary().filter((f) => f.id !== id);
  saveFrameLibrary(frames);
  return frames;
}
