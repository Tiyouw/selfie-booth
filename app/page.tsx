'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoothState, FrameRatio, GridCount, PhotoSlot } from '../lib/types';
import { clearDraft, defaultState, hasPhotos, loadDraft, saveDraft, visibleSlots } from '../lib/state';
import { renderBoothBlob } from '../lib/render';
import { downloadBlob, fileToFrame, fileToPhotoDataURL } from '../lib/image';
import { boothLayout, clamp, MAX_ZOOM, MIN_ZOOM } from '../lib/layout';
import { findBuiltinFrame, frameVariant, framesForRatio, isBuiltinFrame } from '../lib/frames';
import { shareProvider, type ShareLink } from '../lib/share';
import PhotoSlotView from '../components/PhotoSlotView';
import CameraModal from '../components/CameraModal';
import ShareModal from '../components/ShareModal';
import { Toast, useToast } from '../components/useToast';
import {
  CameraIcon,
  CheckIcon,
  DownloadIcon,
  GridIcon,
  ImageIcon,
  LandscapeIcon,
  PortraitIcon,
  ResetIcon,
  ShareIcon,
  UploadIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../components/icons';

export default function Home() {
  const [state, setState] = useState<BoothState>(() => defaultState(3));
  const [hydrated, setHydrated] = useState(false);
  const [activeSlot, setActiveSlot] = useState(0);
  const [captureTarget, setCaptureTarget] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const { toast, show } = useToast();
  const frameInputRef = useRef<HTMLInputElement>(null);

  // Load: shared link first, then local draft.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const shared = await shareProvider.resolve(window.location);
      if (cancelled) return;
      if (shared) {
        setState(shared);
        // strip the payload so edits don't look like they update the shared link
        window.history.replaceState(null, '', window.location.pathname);
        show('Desain dari link berhasil dimuat', 'success');
      } else {
        const draft = loadDraft();
        if (draft) {
          setState(draft);
          if (hasPhotos(draft)) show('Draft terakhir dipulihkan', 'info');
        }
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  // Autosave draft (debounced).
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => saveDraft(state), 400);
    return () => clearTimeout(t);
  }, [state, hydrated]);

  const layout = useMemo(() => boothLayout(state), [state]);
  const slots = visibleSlots(state);
  const filled = slots.filter((s) => s.src).length;
  const activePhoto = slots[activeSlot] as PhotoSlot | undefined;
  const customFrame = !!state.frameSrc && !isBuiltinFrame(state.frameSrc);

  // Preview scale: measure the preview box to convert export px → screen px.
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = previewWidth ? previewWidth / layout.w : 1;

  const updateSlot = useCallback((index: number, patch: Partial<PhotoSlot>) => {
    setState((s) => ({
      ...s,
      slots: s.slots.map((sl, i) => (i === index ? { ...sl, ...patch } : sl)),
    }));
  }, []);

  const setPhoto = useCallback(
    (index: number, src: string | null) => {
      updateSlot(index, { src, zoom: 1, ox: 0, oy: 0 });
      setActiveSlot(index);
    },
    [updateSlot],
  );

  const setGrid = useCallback((grid: GridCount) => {
    setState((s) => ({ ...s, grid }));
    setActiveSlot((a) => Math.min(a, grid - 1));
  }, []);

  const setRatio = useCallback((ratio: FrameRatio) => {
    setState((s) => {
      if (s.frameRatio === ratio) return s;
      const variant = frameVariant(s.frameSrc, ratio);
      return { ...s, frameRatio: ratio, frameSrc: variant ? variant.src : s.frameSrc };
    });
  }, []);

  const chooseFrame = useCallback((src: string | null) => {
    setState((s) => {
      const builtin = findBuiltinFrame(src);
      return { ...s, frameSrc: src, frameRatio: builtin ? builtin.ratio : s.frameRatio };
    });
  }, []);

  const uploadPhoto = useCallback(
    async (index: number, file: File) => {
      try {
        const src = await fileToPhotoDataURL(file);
        setPhoto(index, src);
      } catch (e) {
        show((e as Error).message || 'Gagal memproses gambar', 'error');
      }
    },
    [setPhoto, show],
  );

  const pickFile = useCallback(
    (index: number) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files?.[0];
        if (f) uploadPhoto(index, f);
      };
      input.click();
    },
    [uploadPhoto],
  );

  const firstEmptyOrActive = () => {
    const i = slots.findIndex((s) => !s.src);
    return i >= 0 ? i : activeSlot;
  };

  const moveSlot = useCallback((index: number, dir: -1 | 1) => {
    setState((s) => {
      const j = index + dir;
      if (j < 0 || j >= s.grid) return s;
      const slots = [...s.slots];
      [slots[index], slots[j]] = [slots[j], slots[index]];
      return { ...s, slots: slots.map((sl, i) => ({ ...sl, id: `slot-${i}` })) };
    });
    setActiveSlot(clamp(index + dir, 0, state.grid - 1));
  }, [state.grid]);

  const handleFrameUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const { src, ratio } = await fileToFrame(file);
        setState((s) => ({ ...s, frameSrc: src, frameRatio: ratio }));
        show(`Frame custom diterapkan (${ratio})`, 'success');
      } catch (err) {
        show((err as Error).message || 'Gagal memuat frame', 'error');
      }
    },
    [show],
  );

  const resetAll = useCallback(() => {
    if (hasPhotos(state) && !window.confirm('Mulai baru? Semua foto akan dihapus.')) return;
    clearDraft();
    setState(defaultState(3));
    setActiveSlot(0);
    setShareLink(null);
  }, [state]);

  const handleDownload = useCallback(async () => {
    setBusy('download');
    try {
      const blob = await renderBoothBlob(state);
      downloadBlob(blob, `selfie-booth-${Date.now()}.png`);
      show('PNG berhasil diunduh', 'success');
    } catch (e) {
      console.error(e);
      show('Gagal membuat PNG. Coba lagi.', 'error');
    } finally {
      setBusy(null);
    }
  }, [state, show]);

  const canShareFiles =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function' && !!navigator.canShare;

  const handleShareImage = useCallback(async () => {
    setBusy('share');
    try {
      const blob = await renderBoothBlob(state);
      const file = new File([blob], 'selfie-booth.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Selfie Booth' });
      } else {
        downloadBlob(blob, file.name);
        show('Share file tidak didukung, PNG diunduh', 'info');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') show('Gagal membagikan gambar', 'error');
    } finally {
      setBusy(null);
    }
  }, [state, show]);

  const openShare = useCallback(async () => {
    setShareOpen(true);
    setShareLoading(true);
    try {
      setShareLink(await shareProvider.createLink(state));
    } catch {
      show('Gagal membuat link', 'error');
    } finally {
      setShareLoading(false);
    }
  }, [state, show]);

  // Keyboard: zoom / nudge / delete for the active photo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (captureTarget !== null || shareOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      const slot = slots[activeSlot];
      if (!slot?.src) return;
      const step = 0.05;
      switch (e.key) {
        case '+':
        case '=':
          updateSlot(activeSlot, { zoom: clamp(slot.zoom + 0.1, MIN_ZOOM, MAX_ZOOM) });
          break;
        case '-':
          updateSlot(activeSlot, { zoom: clamp(slot.zoom - 0.1, MIN_ZOOM, MAX_ZOOM) });
          break;
        case 'ArrowLeft':
          updateSlot(activeSlot, { ox: clamp(slot.ox + step, -1, 1) });
          break;
        case 'ArrowRight':
          updateSlot(activeSlot, { ox: clamp(slot.ox - step, -1, 1) });
          break;
        case 'ArrowUp':
          updateSlot(activeSlot, { oy: clamp(slot.oy + step, -1, 1) });
          break;
        case 'ArrowDown':
          updateSlot(activeSlot, { oy: clamp(slot.oy - step, -1, 1) });
          break;
        case 'Delete':
        case 'Backspace':
          setPhoto(activeSlot, null);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slots, activeSlot, captureTarget, shareOpen, updateSlot, setPhoto]);

  const portrait = state.frameRatio === '9:16';

  return (
    <main className="glow-bg min-h-screen pb-16">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2.5">
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
              type="button"
              onClick={resetAll}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-white/5 hover:text-cream"
              title="Mulai desain baru"
            >
              <ResetIcon size={16} /> <span className="hidden sm:inline">Mulai baru</span>
            </button>
            <button
              type="button"
              onClick={openShare}
              disabled={filled === 0}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              title={filled === 0 ? 'Tambahkan foto dulu' : 'Bagikan'}
            >
              <ShareIcon size={16} /> <span className="hidden sm:inline">Bagikan</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy !== null || filled === 0}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-40"
              title={filled === 0 ? 'Tambahkan foto dulu' : 'Download PNG'}
            >
              <DownloadIcon size={16} />
              <span className="hidden sm:inline">{busy === 'download' ? 'Menyiapkan…' : 'Download PNG'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[1fr_360px]">
        {/* Preview */}
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between text-xs text-ink-600">
            <span>
              Preview · {layout.w}×{layout.h}px
            </span>
            <span className={filled === state.grid ? 'text-emerald-400' : ''}>
              {filled === state.grid ? (
                <span className="inline-flex items-center gap-1">
                  <CheckIcon size={13} /> Semua foto terisi
                </span>
              ) : (
                `${filled}/${state.grid} foto terisi`
              )}
            </span>
          </div>

          <div
            ref={previewRef}
            className="preview-checker relative mx-auto overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl"
            style={{
              aspectRatio: portrait ? '9 / 16' : '16 / 9',
              width: portrait ? 'min(100%, calc(72vh * 9 / 16))' : '100%',
            }}
          >
            {slots.map((slot, i) => {
              const cell = layout.cells[i];
              if (!cell) return null;
              return (
                <div
                  key={slot.id}
                  className="absolute"
                  style={{
                    left: `${(cell.x / layout.w) * 100}%`,
                    top: `${(cell.y / layout.h) * 100}%`,
                    width: `${(cell.w / layout.w) * 100}%`,
                    height: `${(cell.h / layout.h) * 100}%`,
                  }}
                >
                  <PhotoSlotView
                    slot={slot}
                    index={i}
                    total={state.grid}
                    cell={cell}
                    scale={scale}
                    active={activeSlot === i}
                    onActivate={() => setActiveSlot(i)}
                    onAdjust={(patch) => updateSlot(i, patch)}
                    onCapture={() => setCaptureTarget(i)}
                    onUpload={(file) => uploadPhoto(i, file)}
                    onRemove={() => setPhoto(i, null)}
                    onMove={(dir) => moveSlot(i, dir)}
                  />
                </div>
              );
            })}

            {state.frameSrc && (
              <img
                src={state.frameSrc}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            )}
          </div>

          {/* Adjust active photo */}
          <div className="mt-4 rounded-xl border border-white/10 bg-ink-900/60 p-4">
            {activePhoto?.src ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold">Atur Foto {activeSlot + 1}</span>
                  <button
                    type="button"
                    onClick={() => updateSlot(activeSlot, { zoom: 1, ox: 0, oy: 0 })}
                    className="flex items-center gap-1 text-xs text-ink-600 hover:text-cream"
                  >
                    <ResetIcon size={13} /> Reset posisi
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Perkecil"
                    onClick={() =>
                      updateSlot(activeSlot, { zoom: clamp(activePhoto.zoom - 0.1, MIN_ZOOM, MAX_ZOOM) })
                    }
                    className="rounded-lg p-1.5 text-ink-600 hover:bg-white/5 hover:text-cream"
                  >
                    <ZoomOutIcon size={18} />
                  </button>
                  <input
                    type="range"
                    aria-label="Zoom"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={activePhoto.zoom}
                    onChange={(e) => updateSlot(activeSlot, { zoom: parseFloat(e.target.value) })}
                    className="w-full accent-[#FF7E1D]"
                  />
                  <button
                    type="button"
                    aria-label="Perbesar"
                    onClick={() =>
                      updateSlot(activeSlot, { zoom: clamp(activePhoto.zoom + 0.1, MIN_ZOOM, MAX_ZOOM) })
                    }
                    className="rounded-lg p-1.5 text-ink-600 hover:bg-white/5 hover:text-cream"
                  >
                    <ZoomInIcon size={18} />
                  </button>
                  <span className="w-12 text-right font-mono text-xs text-ink-600">
                    {activePhoto.zoom.toFixed(2)}×
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-ink-600">
                  Seret foto untuk menggeser · scroll untuk zoom · panah ⇐ ⇒ di foto untuk menukar urutan ·
                  keyboard: +/− zoom, panah geser, Delete hapus
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-600">
                Klik <span className="text-cream">Kamera</span> atau <span className="text-cream">Upload</span> pada
                kotak untuk mengisi foto. Kamu juga bisa seret file gambar langsung ke kotak.
              </p>
            )}
          </div>
        </section>

        {/* Controls */}
        <aside className="space-y-4">
          <Panel step={1} title="Layout">
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(
                [
                  ['16:9', 'Landscape', LandscapeIcon],
                  ['9:16', 'Portrait', PortraitIcon],
                ] as const
              ).map(([ratio, label, Icon]) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setRatio(ratio)}
                  disabled={customFrame}
                  aria-pressed={state.frameRatio === ratio}
                  title={customFrame ? 'Rasio mengikuti frame custom' : label}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    state.frameRatio === ratio
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-white/10 text-ink-600 hover:border-white/20 hover:text-cream'
                  }`}
                >
                  <Icon size={18} /> {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as GridCount[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setGrid(n)}
                  aria-pressed={state.grid === n}
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
            {customFrame && (
              <p className="mt-2 text-[11px] text-ink-600">
                Rasio dikunci ke {state.frameRatio} oleh frame custom. Hapus frame untuk mengubah.
              </p>
            )}
          </Panel>

          <Panel step={2} title="Frame">
            <div className="grid grid-cols-4 gap-2">
              <FrameChoice
                selected={!state.frameSrc}
                onClick={() => chooseFrame(null)}
                label="Tanpa"
                ratio={state.frameRatio}
              >
                <div className="flex h-full w-full items-center justify-center text-ink-600">
                  <XIcon size={16} />
                </div>
              </FrameChoice>
              {framesForRatio(state.frameRatio).map((f) => (
                <FrameChoice
                  key={f.id}
                  selected={state.frameSrc === f.src}
                  onClick={() => chooseFrame(f.src)}
                  label={f.name}
                  ratio={f.ratio}
                >
                  <img src={f.src} alt="" className="h-full w-full" />
                </FrameChoice>
              ))}
            </div>

            <div className="mt-3">
              {customFrame ? (
                <div className="flex items-center justify-between rounded-lg border border-brand/40 bg-brand/5 p-2">
                  <div className="flex items-center gap-2">
                    <img
                      src={state.frameSrc!}
                      alt="frame custom"
                      className="h-8 w-12 rounded bg-ink-800 object-contain"
                    />
                    <div>
                      <p className="text-xs font-medium">Frame custom</p>
                      <p className="text-[11px] text-ink-600">{state.frameRatio}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => chooseFrame(null)}
                    aria-label="Hapus frame custom"
                    className="rounded p-1 text-ink-600 hover:text-red-400"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => frameInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-xs font-medium text-ink-600 transition hover:border-brand hover:text-cream"
                >
                  <UploadIcon size={15} /> Upload frame PNG transparan (16:9 / 9:16)
                </button>
              )}
              <input
                ref={frameInputRef}
                type="file"
                accept="image/png"
                className="hidden"
                onChange={handleFrameUpload}
              />
            </div>
          </Panel>

          <Panel step={3} title="Foto">
            <div className="mb-3 flex gap-1.5">
              {slots.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSlot(i)}
                  aria-label={`Pilih foto ${i + 1}`}
                  className={`h-1.5 flex-1 rounded-full transition ${
                    s.src ? 'bg-emerald-400' : 'bg-white/10'
                  } ${activeSlot === i ? 'ring-2 ring-brand ring-offset-2 ring-offset-ink-900' : ''}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCaptureTarget(firstEmptyOrActive())}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-semibold text-ink-950 hover:bg-brand-bright"
              >
                <CameraIcon size={16} /> Kamera
              </button>
              <button
                type="button"
                onClick={() => pickFile(firstEmptyOrActive())}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 text-sm font-medium hover:bg-white/20"
              >
                <UploadIcon size={16} /> Upload
              </button>
            </div>
            <p className="mt-2 text-[11px] text-ink-600">
              {filled < state.grid
                ? `Mengisi kotak ${firstEmptyOrActive() + 1}. Foto otomatis dikecilkan agar ringan.`
                : `Semua kotak terisi — tombol di atas mengganti foto ${activeSlot + 1}.`}
            </p>
          </Panel>

          <Panel step={4} title="Simpan">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={busy !== null || filled === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-semibold text-ink-950 hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-40"
              >
                <DownloadIcon size={16} /> {busy === 'download' ? 'Menyiapkan…' : 'PNG'}
              </button>
              <button
                type="button"
                onClick={openShare}
                disabled={filled === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 py-2.5 text-sm font-medium hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ShareIcon size={16} /> Bagikan
              </button>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-600">
              <ImageIcon size={13} className="mt-0.5 shrink-0" />
              Hasil {layout.w}×{layout.h}px, persis seperti preview. Draft tersimpan otomatis di browser ini.
            </p>
          </Panel>
        </aside>
      </div>

      <Toast toast={toast} />

      {captureTarget !== null && (
        <CameraModal
          slotIndex={captureTarget}
          onClose={() => setCaptureTarget(null)}
          onCapture={(dataUrl) => {
            setPhoto(captureTarget, dataUrl);
            setCaptureTarget(null);
          }}
        />
      )}

      {shareOpen && (
        <ShareModal
          link={shareLink}
          loading={shareLoading}
          canShareImage={canShareFiles}
          onShareImage={handleShareImage}
          onDownload={handleDownload}
          onClose={() => setShareOpen(false)}
          onCopied={(ok) => show(ok ? 'Link tersalin' : 'Gagal menyalin, salin manual', ok ? 'success' : 'error')}
        />
      )}
    </main>
  );
}

function Panel({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-ink-900/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cream">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[11px] text-ink-600">
          {step}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function FrameChoice({
  selected,
  onClick,
  label,
  ratio,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  ratio: FrameRatio;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 transition ${
        selected ? 'border-brand bg-brand/10' : 'border-white/10 hover:border-white/25'
      }`}
    >
      <div
        className="preview-checker w-full overflow-hidden rounded bg-ink-800"
        style={{ aspectRatio: ratio === '9:16' ? '9 / 16' : '16 / 9', maxHeight: 56 }}
      >
        {children}
      </div>
      <span className={`text-[10px] font-medium ${selected ? 'text-brand' : 'text-ink-600'}`}>{label}</span>
    </button>
  );
}
