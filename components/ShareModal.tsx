'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { ShareLink } from '../lib/share';
import { SHARE_API } from '../lib/share';
import { CheckIcon, DownloadIcon, LinkIcon, ShareIcon, XIcon } from './icons';

interface ShareModalProps {
  link: ShareLink | null;
  loading: boolean;
  canShareImage: boolean;
  onShareImage: () => void;
  onDownload: () => void;
  onDownloadGif: () => void;
  onShareGif: () => void;
  gifBusy: boolean;
  gifEnabled: boolean;
  onClose: () => void;
  onCopied: (ok: boolean) => void;
  onDeleted: (ok: boolean) => void;
}

const secondaryButton =
  'flex items-center justify-center gap-2 rounded-xl border border-white/15 py-2.5 text-sm font-medium hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40';

export default function ShareModal({
  link,
  loading,
  canShareImage,
  onShareImage,
  onDownload,
  onDownloadGif,
  onShareGif,
  gifBusy,
  gifEnabled,
  onClose,
  onCopied,
  onDeleted,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // QR only for short (remote) links — a 400 KB hash link cannot be encoded.
  useEffect(() => {
    let active = true;
    if (!link || link.length > 1200) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(link.url, { margin: 1, width: 160 })
      .then((url) => active && setQr(url))
      .catch(() => active && setQr(null));
    return () => {
      active = false;
    };
  }, [link]);

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

  const removeRemote = async () => {
    if (!link?.id || !link.deleteToken || !SHARE_API || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`${SHARE_API.replace(/\/$/, '')}/v1/designs/${link.id}`, {
        method: 'DELETE',
        headers: { 'X-Delete-Token': link.deleteToken },
      });
      if (res.ok) setDeleted(true);
      onDeleted(res.ok);
    } catch {
      onDeleted(false);
    } finally {
      setDeleting(false);
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
              Cara paling aman: kirim file hasil jadi. Bisa dibuka di mana saja.
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
                className={secondaryButton}
              >
                <ShareIcon size={16} /> Bagikan gambar
              </button>
              <button
                type="button"
                onClick={onDownloadGif}
                disabled={!gifEnabled || gifBusy}
                title={gifEnabled ? 'Foto muncul satu per satu, lalu strip lengkap' : 'Isi minimal satu foto dulu'}
                className={secondaryButton}
              >
                <DownloadIcon size={16} /> {gifBusy ? 'Membuat GIF…' : 'Download GIF'}
              </button>
              <button
                type="button"
                onClick={onShareGif}
                disabled={!gifEnabled || gifBusy || !canShareImage}
                title={gifEnabled && canShareImage ? 'Bagikan GIF lewat aplikasi' : 'Isi foto dulu / browser tidak mendukung share file'}
                className={secondaryButton}
              >
                <ShareIcon size={16} /> Bagikan GIF
              </button>
            </div>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-600">Link desain</h4>
            <p className="mb-3 text-xs text-ink-600">
              {link?.provider === 'remote'
                ? 'Link pendek: bisa dibuka dan diedit lagi di browser lain.'
                : 'Link berisi foto & frame yang bisa dibuka dan diedit lagi di browser lain.'}
            </p>
            {deleted ? (
              <p className="rounded-lg bg-black/40 p-2 text-xs text-ink-600">
                Link telah dihapus dari server. Bagikan file PNG/GIF sebagai gantinya.
              </p>
            ) : loading || !link ? (
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
                {qr && (
                  <div className="mt-3 flex items-center gap-3 rounded-lg bg-black/40 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL dari library QR */}
                    <img src={qr} alt="QR code link share" className="h-20 w-20 rounded bg-cream" />
                    <p className="text-[11px] leading-relaxed text-ink-600">
                      Scan untuk membuka hasil ini di HP lain.
                    </p>
                  </div>
                )}
                {link.provider === 'remote' && link.expiresAt !== undefined && (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/10 p-2.5">
                    <p className="text-[11px] leading-relaxed text-ink-600">
                      Link aktif hingga{' '}
                      {new Date(link.expiresAt * 1000).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                      . Siapa pun yang punya link bisa melihatnya.
                    </p>
                    <button
                      type="button"
                      onClick={removeRemote}
                      disabled={deleting}
                      className="shrink-0 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25 disabled:opacity-40"
                    >
                      {deleting ? 'Menghapus…' : 'Hapus dari server'}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
