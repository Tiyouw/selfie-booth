'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoothState, GridCount, PhotoSlot, FrameRatio } from '../lib/types';
import { defaultState, decodeState, encodeState, makeSlots } from '../lib/state';
import { renderBooth } from '../lib/render';
import { downloadDataURL, fileToCompressedDataURL, detectFrameRatio } from '../lib/image';
import PhotoSlotView from '../components/PhotoSlotView';
import {
  CameraIcon,
  DownloadIcon,
  ShareIcon,
  CheckIcon,
  XIcon,
  UploadIcon,
  FlipIcon,
  GridIcon,
} from '../components/icons';

/** Tailwind grid class for the preview, based on grid count + frame orientation. */
function gridClass(grid: GridCount, ratio: FrameRatio): string {
  const portrait = ratio === '9:16';
  if (grid === 1) return 'grid-cols-1';
  if (grid === 2) return portrait ? 'grid-cols-1 grid-rows-2' : 'grid-cols-2';
  // grid === 3
  return portrait ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2 grid-rows-2';
}

/** Per-slot span class so the layout matches the render. */
function slotClass(grid: GridCount, ratio: FrameRatio, i: number): string {
  if (grid === 1) return '';
  const portrait = ratio === '9:16';
  if (grid === 2) return '';
  // grid === 3
  if (portrait) {
    // first photo spans full width on top
    return i === 0 ? 'col-span-2' : '';
  }
  // landscape: first photo spans 2 rows on the left
  return i === 0 ? 'row-span-2' : '';
}

export default function Home() {
  const [state, setState] = useState<BoothState>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash) {
        const decoded = decodeState(hash);
        if (decoded) return decoded;
      }
    }
    return defaultState(3);
  });

  const [activeSlot, setActiveSlot] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<number | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const shareHash = useMemo(() => encodeState(state), [state]);

  // persist to URL hash on change
  useEffect(() => {
    const url = `${window.location.origin}${window.location.pathname}#${shareHash}`;
    try {
      window.history.replaceState(null, '', url);
    } catch {
      /* URL may be too long; ignore */
    }
  }, [shareHash]);

  const updateSlot = useCallback((index: number, patch: Partial<PhotoSlot>) => {
    setState((s) => ({
      ...s,
      slots: s.slots.map((sl, i) => (i === index ? { ...sl, ...patch } : sl)),
    }));
  }, []);

  const setGrid = useCallback((grid: GridCount) => {
    setState((s) => {
      const slots = makeSlots(grid);
      // carry over existing photos where possible
      for (let i = 0; i < Math.min(grid, s.slots.length); i++) {
        slots[i] = { ...slots[i], ...s.slots[i], id: slots[i].id };
      }
      return { ...s, grid, slots };
    });
  }, []);

  const onPhotoChange = useCallback(
    (index: number, src: string) => {
      updateSlot(index, { src: src || null, zoom: 1, ox: 0, oy: 0 });
    },
    [updateSlot],
  );

  const handleFrameUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToCompressedDataURL(file, 1920, undefined, 'image/png');
    const img = new Image();
    img.onload = () => {
      const ratio = detectFrameRatio(img);
      setState((s) => ({ ...s, frameSrc: dataUrl, frameRatio: ratio }));
      setNotice('Frame diterapkan ✓');
      setTimeout(() => setNotice(null), 2000);
    };
    img.src = dataUrl;
    e.target.value = '';
  }, []);

  const clearFrame = useCallback(() => {
    setState((s) => ({ ...s, frameSrc: null }));
  }, []);

  // drag arrange
  const onDragStart = useCallback((i: number) => setDragIndex(i), []);
  const onDragOver = useCallback((i: number) => setOverIndex(i), []);
  const onDrop = useCallback(() => {
    if (dragIndex === null || overIndex === null || dragIndex === overIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    setState((s) => {
      const slots = [...s.slots];
      const [moved] = slots.splice(dragIndex, 1);
      slots.splice(overIndex, 0, moved);
      return { ...s, slots };
    });
    setDragIndex(null);
    setOverIndex(null);
  }, [dragIndex, overIndex]);

  const startCapture = useCallback((index: number) => {
    setCaptureTarget(index);
    setShowCamera(true);
  }, []);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const dataUrl = await renderBooth(state);
      downloadDataURL(dataUrl, `selfie-booth-${Date.now()}.png`);
    } catch (e) {
      console.error(e);
      setNotice('Gagal render. Coba lagi.');
      setTimeout(() => setNotice(null), 2000);
    } finally {
      setDownloading(false);
    }
  }, [state]);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#${shareHash}`;
    setShareUrl(url);
  }, [shareHash]);

  const copyShare = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice('Gagal copy. Salin manual.');
      setTimeout(() => setNotice(null), 2000);
    }
  }, [shareUrl]);

  const gridCells = useMemo(() => {
    const g = state.grid;
    return g === 1
      ? 'grid-cols-1'
      : g === 2
        ? 'grid-cols-2'
        : 'grid-cols-2 grid-rows-2';
  }, [state.grid]);

  const activePhoto = state.slots[activeSlot];

  return (
    <main className="glow-bg min-h-screen">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-ink-950">
              <CameraIcon size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none">
                Selfie<span className="text-gradient">Booth</span>
              </h1>
              <p className="text-[11px] text-ink-600">by tiyoouw.app</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium hover:bg-white/5"
            >
              <ShareIcon size={16} /> <span className="hidden sm:inline">Share</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-bright disabled:opacity-50"
            >
              <DownloadIcon size={16} />
              {downloading ? 'Menyiapkan…' : <span className="hidden sm:inline">Download PNG</span>}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[1fr_340px]">
        {/* Preview area */}
        <section>
          <div
            className={`relative mx-auto overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl ${
              state.frameRatio === '9:16' ? 'aspect-[9/16] max-h-[75vh]' : 'aspect-[16/9] w-full'
            }`}
            style={{ aspectRatio: state.frameRatio === '9:16' ? '9 / 16' : '16 / 9' }}
          >
            <div
              className={`grid h-full w-full gap-1.5 p-1.5 ${gridClass(state.grid, state.frameRatio)}`}
            >
              {state.slots.map((slot, i) => (
                <div
                  key={slot.id}
                  className={slotClass(state.grid, state.frameRatio, i)}
                >
                  <PhotoSlotView
                    slot={slot}
                    index={i}
                    active={activeSlot === i}
                    onActivate={() => setActiveSlot(i)}
                    onPhotoChange={(src) => onPhotoChange(i, src)}
                    onAdjust={(patch) => updateSlot(i, patch)}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onCapture={startCapture}
                    isDragging={dragIndex === i}
                  />
                </div>
              ))}
            </div>

            {/* Frame overlay preview */}
            {state.frameSrc && (
              <img
                src={state.frameSrc}
                alt="frame"
                className="pointer-events-none absolute inset-0 h-full w-full object-fill"
              />
            )}
          </div>

          {/* Active slot controls */}
          {activePhoto && activePhoto.src && (
            <div className="mt-4 rounded-xl border border-white/10 bg-ink-900/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Atur Foto {activeSlot + 1}</span>
                <span className="text-xs text-ink-600">drag foto untuk geser posisi</span>
              </div>
              <label className="mb-1 flex items-center justify-between text-xs text-ink-600">
                <span>Besar / Kecil</span>
                <span className="font-mono">{activePhoto.zoom.toFixed(2)}x</span>
              </label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={activePhoto.zoom}
                onChange={(e) => updateSlot(activeSlot, { zoom: parseFloat(e.target.value) })}
                className="w-full accent-[#FF7E1D]"
              />
            </div>
          )}
        </section>

        {/* Sidebar controls */}
        <aside className="space-y-5">
          {/* Grid count */}
          <Panel title="Jumlah Kotak">
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as GridCount[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setGrid(n)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition ${
                    state.grid === n
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-white/10 text-ink-600 hover:border-white/20 hover:text-cream'
                  }`}
                >
                  <GridIcon size={22} cols={n} />
                  <span className="text-xs font-semibold">{n} Foto</span>
                </button>
              ))}
            </div>
          </Panel>

          {/* Frame */}
          <Panel title="Frame Custom (PNG)">
            <p className="mb-3 text-xs text-ink-600">
              Upload PNG transparan 16:9 atau 9:16. Rasio terdeteksi otomatis.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 p-5 text-center transition hover:border-brand hover:bg-brand/5">
              <UploadIcon size={22} className="text-brand" />
              <span className="text-sm font-medium">Pilih Frame PNG</span>
              <span className="text-[11px] text-ink-600">16:9 / 9:16 · transparan</span>
              <input type="file" accept="image/png" className="hidden" onChange={handleFrameUpload} />
            </label>
            {state.frameSrc && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-white/5 p-2">
                <div className="flex items-center gap-2">
                  <img src={state.frameSrc} alt="frame thumb" className="h-8 w-14 rounded object-cover" />
                  <span className="text-xs font-medium">{state.frameRatio}</span>
                </div>
                <button onClick={clearFrame} className="rounded p-1 text-ink-600 hover:text-red-400">
                  <XIcon size={16} />
                </button>
              </div>
            )}
          </Panel>

          {/* Add photos */}
          <Panel title="Tambah Foto">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const firstEmpty = state.slots.findIndex((s) => !s.src);
                  startCapture(firstEmpty >= 0 ? firstEmpty : activeSlot);
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 text-sm font-medium hover:bg-white/20"
              >
                <CameraIcon size={16} /> Kamera
              </button>
              <button
                onClick={() => {
                  const firstEmpty = state.slots.findIndex((s) => !s.src);
                  const idx = firstEmpty >= 0 ? firstEmpty : activeSlot;
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (ev) => {
                    const f = (ev.target as HTMLInputElement).files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => onPhotoChange(idx, r.result as string);
                    r.readAsDataURL(f);
                  };
                  input.click();
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 text-sm font-medium hover:bg-white/20"
              >
                <UploadIcon size={16} /> Upload
              </button>
            </div>
          </Panel>

          {/* Share */}
          <Panel title="Bagikan Desain">
            <button
              onClick={handleShare}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-semibold hover:bg-accent-soft"
            >
              <ShareIcon size={16} /> Buat Link Share
            </button>
            {shareUrl && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-black/40 p-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="min-w-0 flex-1 truncate bg-transparent text-xs text-ink-600"
                  />
                  <button
                    onClick={copyShare}
                    className="shrink-0 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-ink-950 hover:bg-brand-bright"
                  >
                    {copied ? '✓ Tersalin' : 'Copy'}
                  </button>
                </div>
                <p className="text-[11px] text-ink-600">
                  Link berisi desain lengkap (foto + frame). Buka di browser lain untuk melihat hasil yang sama.
                </p>
              </div>
            )}
          </Panel>
        </aside>
      </div>

      {/* Notice toast */}
      {notice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-ink-950 shadow-xl">
          {notice}
        </div>
      )}

      {/* Camera modal */}
      {showCamera && (
        <CameraModal
          onClose={() => {
            setShowCamera(false);
            setCaptureTarget(null);
          }}
          onCapture={(dataUrl) => {
            if (captureTarget !== null) onPhotoChange(captureTarget, dataUrl);
            setShowCamera(false);
            setCaptureTarget(null);
          }}
        />
      )}
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/60 p-4">
      <h3 className="mb-3 text-sm font-semibold text-cream">{title}</h3>
      {children}
    </div>
  );
}

function CameraModal({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mirror, setMirror] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (e) {
        setError('Tidak bisa akses kamera. Pastikan izin diberikan & HTTPS aktif.');
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold">Ambil Foto</h3>
          <button onClick={onClose} className="rounded p-1 text-ink-600 hover:text-cream">
            <XIcon size={18} />
          </button>
        </div>
        <div className="relative bg-black">
          {error ? (
            <div className="flex aspect-[16/9] items-center justify-center p-6 text-center text-sm text-ink-600">
              {error}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="aspect-[16/9] w-full object-cover"
                style={{ transform: mirror ? 'scaleX(-1)' : 'none' }}
              />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-600">
                  Menyalakan kamera…
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <button
            onClick={() => setMirror((m) => !m)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium hover:bg-white/5"
          >
            <FlipIcon size={15} /> Mirror
          </button>
          <button
            onClick={capture}
            disabled={!ready}
            className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-brand text-ink-950 shadow-lg hover:bg-brand-bright disabled:opacity-40"
          >
            <CameraIcon size={24} />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xs font-medium text-ink-600 hover:text-cream"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
