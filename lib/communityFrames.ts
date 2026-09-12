import type { FrameRatio, GridCount, Inset } from './types';

/**
 * Shared community frame collection served by the booth API
 * (docs/SHARE_BACKEND.md, docs/TEMPLATES.md). Visible to every visitor;
 * adding or deleting requires the shared access code configured on the API.
 */
export const COMMUNITY_API = (process.env.NEXT_PUBLIC_SHARE_API ?? '').replace(/\/$/, '');

export interface CommunityFrame {
  id: string;
  name: string;
  ratio: FrameRatio;
  grid: GridCount;
  inset: Inset | null;
  createdAt: number;
  imageUrl: string;
}

export function communityEnabled(): boolean {
  return COMMUNITY_API !== '';
}

function parseRecord(value: unknown): CommunityFrame | null {
  if (!value || typeof value !== 'object') return null;
  const f = value as Record<string, unknown>;
  const id = typeof f.id === 'string' ? f.id : '';
  const name = typeof f.name === 'string' ? f.name : '';
  const ratio = f.ratio as FrameRatio;
  const grid = f.grid as GridCount;
  if (!id || !name || !['16:9', '9:16', '1:3'].includes(ratio) || ![1, 2, 3, 4].includes(grid)) return null;
  const inset =
    f.inset && typeof f.inset === 'object'
      ? (Object.fromEntries(Object.entries(f.inset as Record<string, unknown>).map(([k, v]) => [k, Number(v)])) as unknown as Inset)
      : null;
  return {
    id,
    name,
    ratio,
    grid,
    inset: inset && [inset.top, inset.right, inset.bottom, inset.left].every((n) => Number.isFinite(n)) ? inset : null,
    createdAt: typeof f.createdAt === 'number' ? f.createdAt : 0,
    imageUrl: typeof f.imageUrl === 'string' ? f.imageUrl : `${COMMUNITY_API}/v1/frames/${id}/image`,
  };
}

export async function listCommunityFrames(ratio: FrameRatio, fetchFn: typeof fetch = fetch): Promise<CommunityFrame[]> {
  const res = await fetchFn(`${COMMUNITY_API}/v1/frames?ratio=${encodeURIComponent(ratio)}`);
  if (!res.ok) throw new Error('Gagal memuat koleksi komunitas.');
  const body = (await res.json()) as { frames?: unknown[] };
  return (body.frames ?? []).map(parseRecord).filter((f): f is CommunityFrame => f !== null);
}

export async function addCommunityFrame(
  input: { name: string; code: string; dataUrl: string },
  fetchFn: typeof fetch = fetch,
): Promise<CommunityFrame> {
  const blob = await (await fetchFn(input.dataUrl)).blob();
  const form = new FormData();
  form.append('name', input.name);
  form.append('code', input.code);
  form.append('png', new File([blob], 'frame.png', { type: 'image/png' }));
  const res = await fetchFn(`${COMMUNITY_API}/v1/frames`, { method: 'POST', body: form });
  if (res.status === 403) throw new Error('Kode akses salah.');
  if (res.status === 413) throw new Error('Frame terlalu besar untuk koleksi komunitas.');
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Frame ditolak server.');
  }
  if (!res.ok) throw new Error('Gagal menambahkan frame ke koleksi komunitas.');
  const record = parseRecord(await res.json());
  if (!record) throw new Error('Respons koleksi komunitas tidak valid.');
  return record;
}

export async function deleteCommunityFrame(id: string, code: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const res = await fetchFn(`${COMMUNITY_API}/v1/frames/${id}`, {
    method: 'DELETE',
    headers: { 'X-Frame-Code': code },
  });
  if (res.status === 403) throw new Error('Kode akses salah.');
  if (res.status === 404) throw new Error('Frame sudah tidak ada.');
  if (!res.ok) throw new Error('Gagal menghapus frame.');
}
