'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoothState, PhotoSlot } from '../lib/types';
import { CameraIcon, CheckIcon, FlipIcon, ImageIcon, ResetIcon, TimerIcon, XIcon } from './icons';
import CameraPreview from './camera/CameraPreview';
import { captureCameraPhoto } from './camera/capture';
import { cameraSessionReducer, createCameraSession, type CountdownSeconds, type SessionAction } from './camera/session';
import { useCamera } from './camera/useCamera';
import { useCameraSound } from './camera/useCameraSound';

interface CameraModalProps {
  state: BoothState;
  targets: number[];
  onClose: () => void;
  onConfirm: (slots: PhotoSlot[], capturedIndices: number[]) => void;
}

const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
const primary = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink-950 transition hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-40';
const focusable = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function CameraModal({ state, targets, onClose, onConfirm }: CameraModalProps) {
  const [originalState] = useState(() => ({ ...state, slots: state.slots.map((slot) => ({ ...slot })) }));
  const [session, setSession] = useState(() => createCameraSession(state.slots, targets, state.grid));
  const sessionRef = useRef(session);
  const send = useCallback((action: SessionAction) => {
    const next = cameraSessionReducer(sessionRef.current, action);
    if (next !== sessionRef.current) {
      // Update synchronously so duplicate effects and callbacks cannot reuse a capture token.
      sessionRef.current = next;
      setSession(next);
    }
  }, []);
  const pause = useCallback((reason: string) => send({ type: 'pause', reason }), [send]);
  const camera = useCamera(pause);
  const sound = useCameraSound();
  const [mirror, setMirror] = useState(true);
  const [showFrame, setShowFrame] = useState(true);
  const [seconds, setSeconds] = useState<CountdownSeconds>(3);
  const [flash, setFlash] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeDialogRef = useRef<HTMLDivElement>(null);
  const cancelCloseRef = useRef<HTMLButtonElement>(null);
  const lastFullscreenExit = useRef(0);
  const wasFullscreen = useRef(false);
  const exited = useRef(false);
  const closeRequestRef = useRef<() => void>(() => {});
  const closingRef = useRef(closing);
  closingRef.current = closing;
  const lastBeepVersion = useRef(-1);
  const previewState = useMemo(() => ({ ...originalState, slots: session.slots }), [originalState, session.slots]);
  const frozen = session.phase === 'review' || (session.phase === 'paused' && session.resumePhase === 'review');
  const complete = session.phase === 'complete';
  const liveIndex = frozen || complete ? null : session.active;
  const setup = session.phase === 'setup';
  const running = session.phase === 'countdown' || session.phase === 'capturing' || session.phase === 'review';

  useEffect(() => {
    // Saving completed photos must not require a still-connected camera.
    if (!camera.ready && frozen && session.cursor === session.queue.length - 1) send({ type: 'finishReview' });
  }, [camera.ready, frozen, send, session.cursor, session.queue.length]);

  const shutDown = () => {
    camera.stop();
    sound.close();
    if (document.fullscreenElement === rootRef.current) void document.exitFullscreen().catch(() => {});
  };
  const discard = () => {
    if (exited.current) return;
    exited.current = true;
    shutDown();
    onClose();
  };
  const requestClose = () => {
    if (sessionRef.current.phase === 'setup' && !sessionRef.current.changed) discard();
    else {
      send({ type: 'pause' });
      sound.silence();
      setClosing(true);
    }
  };
  closeRequestRef.current = requestClose;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.focus();
    setFullscreenSupported(!!root.requestFullscreen && !!document.fullscreenEnabled);
    const onFullscreen = () => {
      const active = document.fullscreenElement === root;
      if (wasFullscreen.current && !active) lastFullscreenExit.current = Date.now();
      wasFullscreen.current = active;
      setFullscreen(active);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Esc belongs to the browser when leaving fullscreen, not to the session.
        if (document.fullscreenElement || wasFullscreen.current || Date.now() - lastFullscreenExit.current < 600) return;
        event.preventDefault();
        event.stopPropagation();
        if (closingRef.current) setClosing(false);
        else closeRequestRef.current();
      }
      if (event.key !== 'Tab') return;
      const scope = closingRef.current ? closeDialogRef.current : root;
      const elements = Array.from(scope?.querySelectorAll<HTMLElement>(focusable) ?? []).filter((element) => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        root.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === scope || !scope?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === scope || !scope?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      const scope = closingRef.current ? closeDialogRef.current : root;
      if (scope && !scope.contains(event.target as Node)) {
        (scope.querySelector<HTMLElement>(focusable) ?? root).focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreen);
      if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!closing) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelCloseRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [closing]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        send({ type: 'pause', reason: 'Tab tidak aktif. Periksa posisi lalu lanjutkan saat siap.' });
        sound.silence();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [send, sound.silence]);

  useEffect(() => {
    if (session.phase !== 'countdown' && session.phase !== 'review') return;
    const version = session.version;
    const timer = window.setTimeout(() => {
      if (sessionRef.current.version !== version || exited.current) return;
      const terminalReview = sessionRef.current.phase === 'review' && sessionRef.current.cursor === sessionRef.current.queue.length - 1;
      if (!terminalReview && !camera.canCapture()) {
        send({ type: 'pause', reason: document.hidden ? 'Tab tidak aktif. Lanjutkan saat siap.' : 'Kamera belum siap. Pulihkan kamera sebelum melanjutkan.' });
        return;
      }
      send({ type: 'tick', version });
    }, 1000);
    return () => clearTimeout(timer);
  }, [camera.canCapture, send, session.phase, session.version]);

  useEffect(() => {
    if (session.phase !== 'countdown' || lastBeepVersion.current === session.version || !camera.canCapture()) return;
    lastBeepVersion.current = session.version;
    sound.beep(session.remaining === 1);
  }, [camera.canCapture, session.phase, session.remaining, session.version, sound.beep]);

  useEffect(() => {
    if (session.phase !== 'capturing' || sessionRef.current.version !== session.version || exited.current) return;
    const video = camera.videoRef.current;
    if (!camera.canCapture() || !video) {
      send({ type: 'pause', reason: 'Kamera belum siap. Lanjutkan setelah gambar kamera kembali.' });
      return;
    }
    try {
      const src = captureCameraPhoto(video, mirror);
      send({ type: 'captured', version: session.version, src });
      sound.shutter();
      setFlash(true);
    } catch {
      setCaptureError('Foto belum berhasil diambil. Coba kamera lagi, lalu lanjutkan sesi.');
      send({ type: 'pause' });
    }
  }, [camera.canCapture, camera.videoRef, mirror, send, session.phase, session.version, sound.shutter]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(false), 160);
    return () => clearTimeout(timer);
  }, [flash]);

  const startOrResume = () => {
    if (!camera.canCapture() || closing || exited.current) return;
    setCaptureError(null);
    sound.initialize();
    send(setup ? { type: 'start', seconds } : { type: 'resume' });
  };
  const retake = (index: number) => {
    if (!camera.canCapture() || closing) return;
    sound.initialize();
    send({ type: 'retake', index });
  };
  const retryCamera = () => {
    send({ type: 'pause', reason: 'Rekoneksi kamera. Lanjutkan setelah kamera siap.' });
    setCaptureError(null);
    camera.retry();
  };
  const toggleFullscreen = async () => {
    setFullscreenError(null);
    try {
      if (document.fullscreenElement === rootRef.current) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      setFullscreenError('Layar penuh tidak tersedia. Sesi tetap bisa digunakan di tampilan ini.');
    }
  };
  const confirm = () => {
    if (sessionRef.current.phase !== 'complete' || exited.current || closing) return;
    exited.current = true;
    shutDown();
    onConfirm(sessionRef.current.slots.map((slot) => ({ ...slot })), sessionRef.current.capturedIndices);
  };

  const status = complete
    ? 'Semua foto siap. Pilih hasil favoritmu.'
    : session.phase === 'paused'
      ? 'Sesi dijeda'
      : frozen
        ? `Hasil foto ${session.active + 1}`
        : setup
          ? 'Siap untuk sesi foto?'
          : `Bersiap untuk foto ${session.active + 1}`;

  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="camera-session-title" tabIndex={-1} className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-ink-950 text-cream outline-none">
      <video ref={camera.videoRef} autoPlay muted playsInline aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" />
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="hidden rounded-xl bg-brand/15 p-2.5 text-brand sm:block"><CameraIcon size={21} /></span>
          <div>
            <h2 id="camera-session-title" className="text-base font-semibold sm:text-lg">Sesi foto</h2>
            <p className="text-xs text-white/50">{originalState.frameRatio} · {session.targets.length} foto otomatis · tanpa terburu-buru</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {fullscreenSupported && <button type="button" onClick={toggleFullscreen} className={secondary} aria-pressed={fullscreen}>{fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}</button>}
          <button type="button" onClick={requestClose} aria-label="Tutup sesi foto" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 hover:bg-white/10"><XIcon size={20} /></button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-5 lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-h-[420px] flex-col lg:min-h-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold" aria-live="polite">{status}</h3>
              <p className="mt-1 text-xs text-white/50">{complete ? 'Foto belum disimpan sampai kamu memilih Pakai semua.' : setup ? 'Atur posisi. Hitung mundur dan foto berikutnya berjalan otomatis.' : `Foto ${session.cursor + 1} dari ${session.queue.length} · Kotak ${session.active + 1}`}</p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium ${camera.ready ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/60'}`}><span className={`h-1.5 w-1.5 rounded-full ${camera.ready ? 'bg-emerald-400' : 'bg-white/40'}`} />{camera.ready ? 'Kamera siap' : 'Kamera belum siap'}</span>
          </div>

          <div className="relative h-[45dvh] min-h-[230px] overflow-hidden rounded-2xl border border-white/10 bg-black lg:h-auto lg:min-h-0 lg:flex-1">
            <CameraPreview state={previewState} activeCell={complete ? null : session.active} liveIndex={liveIndex} videoRef={camera.videoRef} ready={camera.ready} mirror={mirror} showFrame={showFrame} label={complete ? 'Komposisi hasil sesi foto' : frozen ? `Hasil foto ${session.active + 1}` : `Pratinjau kamera untuk kotak ${session.active + 1}`} />
            {!complete && <span className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/65 px-3 py-1.5 text-xs font-medium backdrop-blur">{frozen ? 'Hasil foto' : 'Live'} · {session.active + 1}</span>}
            {session.phase === 'countdown' && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/10"><span key={session.version} className="countdown-pop text-[112px] font-semibold leading-none text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.65)] sm:text-[160px]" role="timer" aria-label={`Foto dalam ${session.remaining} detik`}>{session.remaining}</span><span className="mt-4 rounded-full bg-black/60 px-4 py-2 text-sm">Lihat kamera & senyum!</span></div>}
            {session.phase === 'paused' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 p-6"><div className="max-w-md rounded-2xl border border-white/15 bg-black/65 px-6 py-5 text-center backdrop-blur"><p className="text-xl font-semibold">Sesi dijeda</p><p className="mt-2 text-sm leading-relaxed text-white/70">{session.pauseReason}</p></div></div>}
            {flash && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/80 motion-reduce:hidden" />}
          </div>

          {(camera.error || captureError) && <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3"><p className="flex-1 text-xs leading-relaxed text-amber-100">{captureError || camera.error}</p><button type="button" className={secondary} onClick={retryCamera}>Coba kamera lagi</button></div>}
          {fullscreenError && <p role="status" className="mt-2 text-xs text-amber-200">{fullscreenError}</p>}
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 py-4">
            {setup && <><button type="button" onClick={startOrResume} disabled={!camera.ready} className={primary}><CameraIcon size={19} />Mulai sesi · {session.targets.length} foto</button>{!camera.ready && !camera.error && <button type="button" onClick={retryCamera} className={secondary}>Coba kamera lagi</button>}</>}
            {running && <button type="button" onClick={() => { send({ type: 'pause' }); sound.silence(); }} className={secondary}><span aria-hidden="true">Ⅱ</span> Jeda</button>}
            {frozen && <button type="button" onClick={() => retake(session.active)} disabled={!camera.ready} className={secondary}><ResetIcon size={16} />Ulangi foto ini</button>}
            {session.phase === 'paused' && <button type="button" onClick={startOrResume} disabled={!camera.ready} className={primary}>Lanjutkan sesi</button>}
            {session.phase === 'paused' && session.hasCompleted && <button type="button" onClick={() => send({ type: 'keepResults' })} className={secondary}>Lihat hasil yang ada</button>}
            {complete && <><button type="button" onClick={() => { if (camera.canCapture()) { sound.initialize(); send({ type: 'restart' }); } }} disabled={!camera.ready} className={secondary}><ResetIcon size={16} />Ulangi semua</button><button type="button" onClick={confirm} className={primary}><CheckIcon size={18} />Pakai semua</button></>}
          </div>
          <p className="min-h-5 text-center text-xs text-white/50" aria-live="polite">{session.phase === 'review' ? session.cursor < session.queue.length - 1 ? `Foto berikutnya dimulai dalam ${session.remaining} detik` : `Tinjau semua hasil dalam ${session.remaining} detik` : session.phase === 'countdown' ? 'Foto diambil otomatis setelah hitung mundur.' : session.phase === 'paused' ? 'Tidak ada foto yang diambil selama jeda.' : setup ? `${seconds} detik bersiap · 3 detik melihat setiap hasil` : 'Ulangi satu foto tanpa mengubah foto lainnya.'}</p>
        </main>

        <aside className="mt-5 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 lg:mt-0 lg:min-h-0 lg:overflow-y-auto" aria-label="Komposisi dan pengaturan sesi">
          <section>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Komposisi</h3><span className="text-[11px] text-white/45">{originalState.grid} kotak</span></div>
            <div className="relative h-64 rounded-xl bg-black/40 lg:h-[28dvh] lg:min-h-[150px]">
              <CameraPreview state={previewState} activeCell={null} liveIndex={liveIndex} videoRef={camera.videoRef} ready={camera.ready} mirror={mirror} showFrame={showFrame} label="Pratinjau komposisi lengkap dengan frame" />
            </div>
            <div className="mt-3 space-y-1.5">
              {session.slots.slice(0, originalState.grid).map((slot, index) => {
                const active = index === session.active && !complete;
                const queuePosition = session.queue.indexOf(index);
                const captured = slot.src !== originalState.slots[index]?.src;
                return <div key={slot.id} className={`flex min-h-10 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs ${active ? 'bg-brand/10 text-brand' : 'bg-white/[0.03] text-white/65'}`}><span className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${captured ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10'}`}>{captured ? <CheckIcon size={12} /> : index + 1}</span>Foto {index + 1}</span>{complete ? <button type="button" onClick={() => retake(index)} disabled={!camera.ready} aria-label={`Ulangi foto ${index + 1}`} className="rounded-md px-2 py-1 font-medium text-brand hover:bg-brand/10 disabled:opacity-40">Ulangi</button> : <span className="text-[10px]">{active ? frozen ? 'Hasil' : 'Aktif' : captured ? 'Siap' : queuePosition >= session.cursor ? 'Menunggu' : slot.src ? 'Dipertahankan' : 'Kosong'}</span>}</div>;
              })}
            </div>
          </section>
          <section className="space-y-3 border-t border-white/10 pt-4" aria-label="Pengaturan kamera">
            <h3 className="text-sm font-semibold">Pengaturan</h3>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={sound.toggle} aria-pressed={sound.enabled} className={`${secondary} ${sound.enabled ? 'border-brand/30 text-brand' : ''}`}><SoundIcon enabled={sound.enabled} />{sound.enabled ? 'Suara aktif' : 'Suara mati'}</button>
              <button type="button" onClick={() => setShowFrame((show) => !show)} disabled={!originalState.frameSrc} aria-pressed={showFrame && !!originalState.frameSrc} className={`${secondary} ${showFrame && originalState.frameSrc ? 'border-brand/30 text-brand' : ''}`}><ImageIcon size={16} />Frame {showFrame && originalState.frameSrc ? 'on' : 'off'}</button>
              <button type="button" onClick={() => setMirror((value) => !value)} disabled={!setup} aria-pressed={mirror} className={`${secondary} ${mirror ? 'border-brand/30 text-brand' : ''}`}><FlipIcon size={16} />Cermin</button>
              <label className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-2 text-sm"><TimerIcon size={16} /><select aria-label="Durasi hitung mundur" disabled={!setup} value={seconds} onChange={(event) => setSeconds(Number(event.target.value) as CountdownSeconds)} className="min-w-0 bg-ink-950 py-2 disabled:opacity-40">{([3, 5, 10] as const).map((value) => <option key={value} value={value}>{value} detik</option>)}</select></label>
            </div>
            {(setup || (session.phase === 'paused' && !camera.ready)) && <label className="block text-xs text-white/60">Kamera<select aria-label="Pilih kamera" value={camera.deviceId} onChange={(event) => camera.selectDevice(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/15 bg-ink-950 p-2.5 text-xs text-cream"><option value="">Kamera otomatis</option>{camera.devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Kamera ${index + 1}`}</option>)}</select></label>}
            <p className="text-[11px] leading-relaxed text-white/45">Frame hanya untuk pratinjau. Foto disimpan tanpa frame atau hitung mundur. Cermin tidak membalik artwork.</p>
          </section>
        </aside>
      </div>

      {closing && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"><div ref={closeDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="discard-session-title" aria-describedby="discard-session-description" className="w-full max-w-md rounded-2xl border border-white/15 bg-ink-900 p-6 shadow-2xl"><h3 id="discard-session-title" className="text-lg font-semibold">Keluar dari sesi foto?</h3><p id="discard-session-description" className="mt-2 text-sm leading-relaxed text-white/60">Hasil sesi ini belum disimpan. Foto sebelumnya akan tetap ada jika kamu keluar.</p><div className="mt-6 flex flex-wrap justify-end gap-2"><button ref={cancelCloseRef} type="button" onClick={() => setClosing(false)} className={secondary}>Kembali ke sesi</button><button type="button" onClick={discard} className="min-h-11 rounded-xl bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/25">Keluar tanpa menyimpan</button></div></div></div>}
    </div>
  );
}

function SoundIcon({ enabled }: { enabled: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" />{enabled ? <><path d="M15 8a6 6 0 0 1 0 8" /><path d="M18 5a10 10 0 0 1 0 14" /></> : <path d="m16 9 5 6m0-6-5 6" />}</svg>;
}
