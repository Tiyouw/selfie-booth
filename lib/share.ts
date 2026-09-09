import type { BoothState } from './types';
import { compressDataURL } from './image';
import { decodeState, encodeState, visibleSlots } from './state';

/**
 * Share-link provider abstraction.
 *
 * Today only `hashShareProvider` exists: the whole design is compressed into
 * the URL fragment, so no backend is needed but links get long. A remote
 * provider (VPS API that stores the design and returns a short id) can be
 * dropped in behind this same interface — see docs/SHARE_BACKEND.md.
 */
export interface ShareLink {
  url: string;
  /** Total URL length in characters. */
  length: number;
  /** Rough size class used for UI hints. */
  size: 'small' | 'long' | 'huge';
}

export interface ShareProvider {
  id: string;
  createLink(state: BoothState): Promise<ShareLink>;
  /** Resolve the current location into a shared state, or null if none. */
  resolve(location: Location): Promise<BoothState | null>;
}

/** Share-link photo size: smaller than the working copy to keep URLs short. */
const SHARE_PHOTO_DIM = 720;
const SHARE_PHOTO_QUALITY = 0.72;

export const HASH_PREFIX = 'd=';

function classify(length: number): ShareLink['size'] {
  if (length <= 8_000) return 'small';
  if (length <= 400_000) return 'long';
  return 'huge';
}

export async function shareableState(state: BoothState): Promise<BoothState> {
  const slots = await Promise.all(
    visibleSlots(state).map(async (s) => ({
      ...s,
      src: s.src ? await compressDataURL(s.src, SHARE_PHOTO_DIM, SHARE_PHOTO_QUALITY) : null,
    })),
  );
  return { ...state, slots };
}

export const hashShareProvider: ShareProvider = {
  id: 'hash',
  async createLink(state) {
    const compact = await shareableState(state);
    const url = `${window.location.origin}${window.location.pathname}#${HASH_PREFIX}${encodeState(compact)}`;
    return { url, length: url.length, size: classify(url.length) };
  },
  async resolve(location) {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return null;
    // accept both the prefixed form and legacy bare-hash links
    const payload = hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : hash;
    return decodeState(payload);
  },
};

export const shareProvider: ShareProvider = hashShareProvider;
