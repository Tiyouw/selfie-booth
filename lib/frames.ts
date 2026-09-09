import type { FrameRatio, Inset } from './types';

/**
 * Built-in frame registry.
 *
 * To add a frame: drop a transparent PNG/SVG into `public/frames/` sized
 * 1920×1080 (16:9), 1080×1920 (9:16), or 640×1920 (1:3), then add an entry
 * below. `name` groups ratio variants so switching ratio keeps the look.
 * `inset` is the transparent window (in export pixels) the photos are laid
 * out inside, so thick frame borders never cover the photos.
 */
export interface BuiltinFrame {
  id: string;
  name: string;
  ratio: FrameRatio;
  src: string;
  inset: Inset;
}

const thin = (v: number): Inset => ({ top: v, right: v, bottom: v, left: v });

export const BUILTIN_FRAMES: BuiltinFrame[] = [
  {
    id: 'klasik-16x9',
    name: 'Klasik',
    ratio: '16:9',
    src: '/frames/klasik-16x9.svg',
    inset: thin(40),
  },
  {
    id: 'klasik-9x16',
    name: 'Klasik',
    ratio: '9:16',
    src: '/frames/klasik-9x16.svg',
    inset: thin(40),
  },
  {
    id: 'klasik-1x3',
    name: 'Klasik',
    ratio: '1:3',
    src: '/frames/klasik-1x3.svg',
    inset: { top: 180, right: 24, bottom: 180, left: 24 },
  },
  {
    id: 'polaroid-16x9',
    name: 'Polaroid',
    ratio: '16:9',
    src: '/frames/polaroid-16x9.svg',
    inset: { top: 48, right: 48, bottom: 150, left: 48 },
  },
  {
    id: 'polaroid-9x16',
    name: 'Polaroid',
    ratio: '9:16',
    src: '/frames/polaroid-9x16.svg',
    inset: { top: 48, right: 48, bottom: 210, left: 48 },
  },
  {
    id: 'polaroid-1x3',
    name: 'Polaroid',
    ratio: '1:3',
    src: '/frames/polaroid-1x3.svg',
    inset: { top: 144, right: 28, bottom: 240, left: 28 },
  },
  {
    id: 'neon-16x9',
    name: 'Neon',
    ratio: '16:9',
    src: '/frames/neon-16x9.svg',
    inset: thin(56),
  },
  {
    id: 'neon-9x16',
    name: 'Neon',
    ratio: '9:16',
    src: '/frames/neon-9x16.svg',
    inset: thin(56),
  },
  {
    id: 'neon-1x3',
    name: 'Neon',
    ratio: '1:3',
    src: '/frames/neon-1x3.svg',
    inset: { top: 176, right: 32, bottom: 176, left: 32 },
  },
];

export const DEFAULT_FRAME = BUILTIN_FRAMES[0];

export function findBuiltinFrame(src: string | null | undefined): BuiltinFrame | null {
  if (!src) return null;
  return BUILTIN_FRAMES.find((f) => f.src === src) ?? null;
}

export function isBuiltinFrame(src: string | null | undefined): boolean {
  return findBuiltinFrame(src) !== null;
}

/** Same design in another ratio, if it exists. */
export function frameVariant(src: string | null, ratio: FrameRatio): BuiltinFrame | null {
  const current = findBuiltinFrame(src);
  if (!current) return null;
  return BUILTIN_FRAMES.find((f) => f.name === current.name && f.ratio === ratio) ?? null;
}

export function framesForRatio(ratio: FrameRatio): BuiltinFrame[] {
  return BUILTIN_FRAMES.filter((f) => f.ratio === ratio);
}
