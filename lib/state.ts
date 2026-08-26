import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { BoothState, GridCount } from './types';

export function makeSlots(grid: GridCount): BoothState['slots'] {
  const n = grid;
  return Array.from({ length: n }, (_, i) => ({
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
    frameSrc: null,
    frameRatio: '16:9',
    slots: makeSlots(grid),
  };
}

/** Serialize state into a compact shareable string (URL-safe). */
export function encodeState(state: BoothState): string {
  // Drop null frame to keep it small when empty
  const payload = {
    g: state.grid,
    f: state.frameSrc,
    r: state.frameRatio,
    s: state.slots.map((s) => [s.src, s.zoom, s.ox, s.oy] as const),
  };
  const json = JSON.stringify(payload);
  return compressToEncodedURIComponent(json);
}

/** Deserialize a compact string back into BoothState. */
export function decodeState(str: string): BoothState | null {
  try {
    const json = decompressFromEncodedURIComponent(str);
    if (!json) return null;
    const p = JSON.parse(json);
    if (typeof p.g !== 'number') return null;
    const grid = (Math.min(3, Math.max(1, p.g)) as GridCount) || 3;
    const slots: BoothState['slots'] = Array.isArray(p.s)
      ? p.s.map((arr: unknown, i: number) => {
          const a = arr as (string | null | number)[];
          return {
            id: `slot-${i}`,
            src: typeof a?.[0] === 'string' ? (a[0] as string) : null,
            zoom: typeof a?.[1] === 'number' ? (a[1] as number) : 1,
            ox: typeof a?.[2] === 'number' ? (a[2] as number) : 0,
            oy: typeof a?.[3] === 'number' ? (a[3] as number) : 0,
          };
        })
      : makeSlots(grid);
    return {
      grid,
      frameSrc: typeof p.f === 'string' ? p.f : null,
      frameRatio: p.r === '9:16' ? '9:16' : '16:9',
      slots,
    };
  } catch {
    return null;
  }
}
