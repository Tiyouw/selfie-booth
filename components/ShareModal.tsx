'use client';

import React, { useEffect, useState } from 'react';
import type { ShareLink } from '../lib/share';
import { CheckIcon, DownloadIcon, LinkIcon, ShareIcon, XIcon } from './icons';

interface ShareModalProps {
  link: ShareLink | null;
  loading: boolean;
  canShareImage: boolean;
  onShareImage: () => void;
  onDownload: () => void;
  onClose: () => void;
  onCopied: (ok: boolean) => void;
}

export default function ShareModal({
  link,
  loading,
  canShareImage,
  onShareImage,
  onDownload,
  onClose,
  onCopied,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      onCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopied(false);
    }
  };

  const sizeKb = link ? Math.round(link.length / 1024) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Bagikan"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold">Simpan & Bagikan</h3>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded p-1 text-ink-600 hover:text-cream">
            <XIcon size={18} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-600">Hasil gambar</h4>
            <p className="mb-3 text-xs text-ink-600">
              Cara paling aman: kirim file PNG hasil jadi. Bisa dibuka di mana saja.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onDownload}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-semibold text-ink-950 hover:bg-brand-bright"
              >
                <DownloadIcon size={16} /> Download PNG
              </button>
              <button
                type="button"
                onClick={onShareImage}
                disabled={!canShareImage}
                title={canShareImage ? 'Bagikan lewat aplikasi' : 'Browser ini tidak mendukung share file'}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/15 py-2.5 text-sm font-medium hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ShareIcon size={16} /> Bagikan gambar
              </button>
            </div>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-600">Link desain</h4>
            <p className="mb-3 text-xs text-ink-600">
              Link berisi foto & frame yang bisa dibuka dan diedit lagi di browser lain.
            </p>
            {loading || !link ? (
              <div className="h-10 animate-pulse rounded-lg bg-white/5" />
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-black/40 p-2">
                  <LinkIcon size={14} className="shrink-0 text-ink-600" />
                  <input
                    readOnly
                    value={link.url}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Link share"
                    className="min-w-0 flex-1 truncate bg-transparent font-mono text-xs text-ink-600 outline-none"
                  />
                  <button
                    type="button"
                    onClick={copy}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/20"
                  >
                    {copied ? (
                      <>
                        <CheckIcon size={13} /> Tersalin
                      </>
                    ) : (
                      'Salin'
                    )}
                  </button>
                </div>
                <p
                  className={`mt-2 text-[11px] ${
                    link.size === 'huge'
                      ? 'text-red-400'
                      : link.size === 'long'
                        ? 'text-amber-400'
                        : 'text-ink-600'
                  }`}
                >
                  {link.size === 'small' && `Ukuran link ${sizeKb} KB — aman dibagikan lewat chat.`}
                  {link.size === 'long' &&
                    `Link panjang (${sizeKb} KB). Umumnya tetap bisa dibuka di Chrome/Firefox, tapi mungkin terpotong oleh WhatsApp/SMS. Jika ragu, bagikan file PNG.`}
                  {link.size === 'huge' &&
                    `Link terlalu panjang (${sizeKb} KB) dan kemungkinan gagal dibuka. Bagikan file PNG saja.`}
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
