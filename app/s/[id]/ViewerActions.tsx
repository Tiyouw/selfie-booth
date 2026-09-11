'use client';

import { useState } from 'react';
import type { BoothState } from '@/lib/types';
import { renderBoothBlob } from '@/lib/render';
import { downloadBlob } from '@/lib/image';

interface ViewerActionsProps {
  state: BoothState;
  gifUrl: string | null;
  editorUrl: string;
}

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-cream transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40';

export default function ViewerActions({ state, gifUrl, editorUrl }: ViewerActionsProps) {
  const [busy, setBusy] = useState<'png' | 'gif' | null>(null);
  const [error, setError] = useState(false);

  const downloadPng = async () => {
    setBusy('png');
    setError(false);
    try {
      const blob = await renderBoothBlob(state);
      downloadBlob(blob, `selfie-booth-${Date.now()}.png`);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  const downloadGif = async () => {
    if (!gifUrl) return;
    setBusy('gif');
    setError(false);
    try {
      const res = await fetch(gifUrl);
      if (!res.ok) throw new Error('gagal memuat GIF');
      downloadBlob(await res.blob(), `selfie-booth-${Date.now()}.gif`);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(window.location.href)}`, '_blank', 'noopener');
  };

  return (
    <div className="w-full space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={downloadPng}
          disabled={busy !== null}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'png' ? 'Menyiapkan…' : 'Unduh PNG'}
        </button>
        <button
          type="button"
          onClick={downloadGif}
          disabled={busy !== null || !gifUrl}
          title={gifUrl ? 'GIF strip animasi' : 'Tidak ada GIF untuk hasil ini'}
          className={button}
        >
          {busy === 'gif' ? 'Mengunduh…' : 'Unduh GIF'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={shareWhatsApp} className={button}>
          Bagikan via WhatsApp
        </button>
        <a href={editorUrl} className={button}>
          Buka di editor
        </a>
      </div>
      {error && <p className="text-center text-xs text-red-400">Gagal menyiapkan unduhan. Coba lagi.</p>}
    </div>
  );
}
