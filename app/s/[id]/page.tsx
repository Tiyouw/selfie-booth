import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { BoothState } from '@/lib/types';
import { encodeState, sanitizeState } from '@/lib/state';
import ViewerActions from './ViewerActions';

const API = (process.env.SHARE_API || process.env.NEXT_PUBLIC_SHARE_API || '').replace(/\/$/, '');

interface LoadedDesign {
  state: BoothState;
  gifUrl: string | null;
}

async function loadDesign(id: string): Promise<LoadedDesign | null> {
  if (!API) return null;
  try {
    const res = await fetch(`${API}/v1/designs/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const state = sanitizeState(data);
    if (!state) return null;
    return { state, gifUrl: typeof data.gifUrl === 'string' ? data.gifUrl : null };
  } catch {
    return null;
  }
}

function validId(id: string): boolean {
  return /^[A-Za-z0-9]{8}$/.test(id);
}

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const og = validId(id) ? `${API}/v1/designs/${encodeURIComponent(id)}/og.png` : '';
  return {
    title: 'HIMASIF Booth | Expo 2026',
    description: 'Momen Expo 2026 bersama HIMASIF — buka untuk mengunduh dan membagikan foto.',
    openGraph: og ? { images: [{ url: og }], type: 'website' } : undefined,
    twitter: og ? { card: 'summary_large_image', images: [og] } : undefined,
  };
}

export default async function SharedDesignPage({ params }: PageProps) {
  const { id } = await params;
  const design = validId(id) ? await loadDesign(id) : null;
  if (!design) notFound();

  const og = `${API}/v1/designs/${encodeURIComponent(id)}/og.png`;
  const editorUrl = `/#d=${encodeState(design.state)}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 p-5">
      <header className="text-center">
        <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-lime-300">EXPO 2026</p>
        <h1 className="text-xl font-bold">HIMASIF Booth</h1>
      </header>
      {/* eslint-disable-next-line @next/next/no-img-element -- cross-origin OG asset, not part of the bundler */}
      <img
        src={og}
        alt="Hasil foto HIMASIF Booth"
        className="w-full rounded-xl border border-white/10 bg-ink-900 shadow-2xl"
      />
      <ViewerActions state={design.state} gifUrl={design.gifUrl} editorUrl={editorUrl} />
    </main>
  );
}
