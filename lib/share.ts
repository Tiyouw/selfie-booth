import type { BoothState } from './types';
import { compressDataURL } from './image';
import { buildPayload, decodeState, encodeState, visibleSlots } from './state';

/**
 * Share-link provider abstraction.
 *
 * Two providers:
 * - `hashShareProvider`: the whole design compressed into the URL fragment —
 *   zero backend, but links get long.
 * - `remoteShareProvider`: POSTs the design to the share API (VPS) and returns
 *   a short link with QR/delete-token metadata; falls back to the hash provider
 *   whenever the API is unreachable or rejects the upload.
 * See docs/SHARE_BACKEND.md for the API contract.
 */
export interface ShareLink {
  url: string;
  /** Total URL length in characters. */
  length: number;
  /** Rough size class used for UI hints. */
  size: 'small' | 'long' | 'huge';
  provider: 'hash' | 'remote';
  /** Remote links only. */
  id?: string;
  gifUrl?: string;
  expiresAt?: number;
  /** One-time delete token — kept in page memory only, never persisted. */
  deleteToken?: string;
}

export interface ShareProvider {
  id: 'hash' | 'remote';
  createLink(state: BoothState): Promise<ShareLink>;
  /** Resolve the current location into a shared state, or null if none. */
  resolve(location: Location): Promise<BoothState | null>;
}

/** Share-link photo size: smaller than the working copy to keep URLs short. */
const SHARE_PHOTO_DIM = 720;
const SHARE_PHOTO_QUALITY = 0.72;

export const HASH_PREFIX = 'd=';

/** Inlined by Next at build time; empty = hash-only sharing. */
export const SHARE_API = process.env.NEXT_PUBLIC_SHARE_API ?? '';

function classify(length: number): ShareLink['size'] {
  if (length <= 8_000) return 'small';
  if (length <= 400_000) return 'long';
  return 'huge';
}

export async function shareableState(state: BoothState): Promise<BoothState> {
  const slots = await Promise.all(
    visibleSlots(state).map(async (s) => ({
      ...s,
      // Compression is best-effort: an undecodable source keeps the original.
      src: s.src ? await compressDataURL(s.src, SHARE_PHOTO_DIM, SHARE_PHOTO_QUALITY).catch(() => s.src) : null,
    })),
  );
  return { ...state, slots };
}

export const hashShareProvider: ShareProvider = {
  id: 'hash',
  async createLink(state) {
    const compact = await shareableState(state);
    const url = `${window.location.origin}${window.location.pathname}#${HASH_PREFIX}${encodeState(compact)}`;
    return { url, length: url.length, size: classify(url.length), provider: 'hash' };
  },
  async resolve(location) {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return null;
    // accept both the prefixed form and legacy bare-hash links
    const payload = hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : hash;
    return decodeState(payload);
  },
};

/** GIF upload is best-effort: a render failure never blocks the share link. */
async function renderGifSafe(state: BoothState): Promise<Blob | null> {
  try {
    const { renderBoothGifBlob } = await import('./gif');
    return await renderBoothGifBlob(state);
  } catch {
    return null;
  }
}

async function postDesign(original: BoothState, compact: BoothState): Promise<ShareLink> {
  const form = new FormData();
  form.append('design', JSON.stringify(buildPayload(compact, visibleSlots(compact))));
  const gif = await renderGifSafe(original);
  if (gif) form.append('gif', new File([gif], 'strip.gif', { type: 'image/gif' }));

  const res = await fetch(`${SHARE_API.replace(/\/$/, '')}/v1/designs`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`share api ${res.status}`);
  const data = (await res.json()) as {
    id: string;
    url: string;
    gifUrl?: string;
    expiresAt: number;
    deleteToken: string;
  };
  return {
    url: data.url,
    length: data.url.length,
    size: classify(data.url.length),
    provider: 'remote',
    id: data.id,
    gifUrl: data.gifUrl,
    expiresAt: data.expiresAt,
    deleteToken: data.deleteToken,
  };
}

export const remoteShareProvider: ShareProvider = {
  id: 'remote',
  async createLink(state) {
    const compact = await shareableState(state);
    try {
      return await postDesign(state, compact);
    } catch {
      // API down or rejected: degrade to the zero-backend hash link.
      return hashShareProvider.createLink(state);
    }
  },
  // /s/:id links are handled by the viewer route; keep resolving hash links.
  resolve: (location) => hashShareProvider.resolve(location),
};

export const shareProvider: ShareProvider = SHARE_API ? remoteShareProvider : hashShareProvider;
