'use client';

import { useEffect, useRef } from 'react';
import { PlusIcon, UploadIcon, XIcon } from './icons';

/**
 * Single entry point for adding frames (docs/SHARE_BACKEND.md).
 * Step 1: access code — unlocks the upload zone.
 * The code itself is only validated by the API at upload time (403 on POST),
 * so a wrong code surfaces here after the file is picked.
 */
export default function AddFrameModal({
  open,
  code,
  onCodeChange,
  unlocked,
  error,
  busy,
  requiresCode,
  templateSize,
  onUnlock,
  onBackToCode,
  onClose,
  onPickFile,
}: {
  open: boolean;
  code: string;
  onCodeChange: (value: string) => void;
  unlocked: boolean;
  error: string;
  busy: boolean;
  requiresCode: boolean;
  templateSize: { w: number; h: number };
  onUnlock: () => void;
  onBackToCode: () => void;
  onClose: () => void;
  onPickFile: () => void;
}) {
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !unlocked) codeRef.current?.focus();
  }, [open, unlocked]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tambah frame"
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="absolute right-3 top-3 rounded-sm p-1 text-ink-600 hover:text-cream"
        >
          <XIcon size={16} />
        </button>
        <h3 className="text-base font-bold">Tambah frame</h3>
        <p className="mt-1 text-xs text-ink-600">
          {unlocked || !requiresCode
            ? `Frame PNG ${templateSize.w}×${templateSize.h}px dengan jendela transparan. Unduh template bila belum punya.`
            : 'Masukkan kode akses dari panitia untuk membuka upload frame.'}
        </p>

        {unlocked || !requiresCode ? (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={onPickFile}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand/40 bg-brand/5 px-3 py-6 text-sm font-medium text-brand transition hover:border-brand hover:bg-brand/10 disabled:opacity-50"
            >
              {busy ? (
                'Mengunggah…'
              ) : (
                <>
                  <UploadIcon size={18} /> Pilih file PNG
                </>
              )}
            </button>
            {requiresCode && (
              <p className="text-[11px] text-ink-600">
                Kode tersimpan di sesi ini. Upload ditolak server bila kode
                salah.
              </p>
            )}
            {requiresCode && (
              <button
                type="button"
                onClick={onBackToCode}
                className="text-[11px] text-ink-600 underline hover:text-cream"
              >
                Ganti kode akses
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              ref={codeRef}
              type="text"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onUnlock();
              }}
              placeholder="Kode akses"
              aria-label="Kode akses"
              spellCheck={false}
              className="w-full rounded-xl border border-white/15 bg-ink-950 px-4 py-3 text-center text-lg font-semibold tracking-[0.3em] text-cream placeholder:text-ink-600 placeholder:tracking-normal placeholder:font-normal placeholder:text-base focus:border-brand focus:outline-hidden"
            />
            <button
              type="button"
              disabled={!code.trim()}
              onClick={onUnlock}
              className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-ink-950 hover:bg-brand-bright disabled:opacity-40"
            >
              Lanjut
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
