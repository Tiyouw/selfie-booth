'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PHOTO_MAX_DIM, PHOTO_QUALITY } from '../lib/image';
import { CameraIcon, CheckIcon, FlipIcon, ResetIcon, SwapIcon, TimerIcon, XIcon } from './icons';

type Timer = 0 | 3 | 5;

interface CameraModalProps {
  slotIndex: number;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}

function describeCameraError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (typeof navigator !== 'undefined' && !navigator.mediaDevices?.getUserMedia) {
    return 'Browser ini tidak mendukung kamera. Coba Chrome/Edge/Safari terbaru, atau pakai Upload.';
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Kamera hanya bisa diakses lewat HTTPS (atau localhost).';
  }
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Izin kamera ditolak. Klik ikon kamera/gembok di address bar untuk mengizinkan, lalu coba lagi.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Kamera tidak ditemukan di perangkat ini.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.';
    default:
      return 'Tidak bisa mengakses kamera. Coba muat ulang halaman atau pakai Upload.';
  }
}

export default function CameraModal({ slotIndex, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mirror, setMirror] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [timer, setTimer] = useState<Timer>(3);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(describeCameraError(null));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stopStream();
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {
            /* autoplay may be blocked until metadata loads; onPlaying handles readiness */
          });
        }
        // labels are only available after permission is granted
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(all.filter((d) => d.kind === 'videoinput'));
      } catch (e) {
        if (!cancelled) setError(describeCameraError(e));
      }
    }
    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [deviceId, attempt, stopStream]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const takeFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    setPreview(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
  }, [mirror]);

  const shoot = useCallback(() => {
    if (!ready || countdown !== null) return;
    if (timer === 0) {
      takeFrame();
      return;
    }
    setCountdown(timer);
  }, [ready, countdown, timer, takeFrame]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      takeFrame();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, takeFrame]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
        e.preventDefault();
        if (preview) onCapture(preview);
        else shoot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shoot, preview, onCapture]);

  const switchCamera = () => {
    if (devices.length < 2) return;
    const current = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
    const idx = devices.findIndex((d) => d.deviceId === current);
    const next = devices[(idx + 1) % devices.length];
    setDeviceId(next.deviceId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Ambil foto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold">
            {preview ? 'Hasil Foto' : 'Ambil Foto'}{' '}
            <span className="text-ink-600">· Kotak {slotIndex + 1}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded p-1 text-ink-600 hover:text-cream"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="relative aspect-video bg-black">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <CameraIcon size={32} className="text-ink-600" />
              <p className="max-w-sm text-sm text-ink-600">{error}</p>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/5"
              >
                Coba lagi
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onPlaying={() => setReady(true)}
                className={`h-full w-full object-cover ${preview ? 'invisible' : ''}`}
                style={{ transform: mirror ? 'scaleX(-1)' : 'none' }}
              />
              {preview && (
                <img src={preview} alt="Hasil foto" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {!ready && !preview && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-600">
                  Menyalakan kamera…
                </div>
              )}
              {countdown !== null && countdown > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span
                    key={countdown}
                    className="countdown-pop text-8xl font-extrabold text-white drop-shadow-lg"
                  >
                    {countdown}
                  </span>
                </div>
              )}
              {flash && <div className="absolute inset-0 bg-white" />}
            </>
          )}
        </div>

        {preview ? (
          <div className="flex items-center justify-center gap-3 p-4">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/5"
            >
              <ResetIcon size={16} /> Foto ulang
            </button>
            <button
              type="button"
              onClick={() => onCapture(preview)}
              className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-brand-bright"
            >
              <CheckIcon size={16} /> Pakai foto ini
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMirror((m) => !m)}
                aria-pressed={mirror}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
                  mirror ? 'border-brand/50 bg-brand/10 text-brand' : 'border-white/10 hover:bg-white/5'
                }`}
                title="Cermin (mirror)"
              >
                <FlipIcon size={15} /> Mirror
              </button>
              {devices.length > 1 && (
                <button
                  type="button"
                  onClick={switchCamera}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium hover:bg-white/5"
                  title="Ganti kamera"
                >
                  <SwapIcon size={15} /> Ganti
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={shoot}
              disabled={!ready || !!error || countdown !== null}
              aria-label="Ambil foto"
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-brand text-ink-950 shadow-lg transition hover:bg-brand-bright active:scale-95 disabled:opacity-40"
            >
              <CameraIcon size={26} />
            </button>
            <div className="flex items-center justify-end gap-1">
              <TimerIcon size={15} className="mr-1 text-ink-600" />
              {([0, 3, 5] as Timer[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTimer(t)}
                  aria-pressed={timer === t}
                  className={`rounded-md px-2 py-1 text-xs font-semibold ${
                    timer === t ? 'bg-white/15 text-cream' : 'text-ink-600 hover:text-cream'
                  }`}
                >
                  {t === 0 ? 'Off' : `${t}s`}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="border-t border-white/5 px-4 py-2 text-center text-[11px] text-ink-600">
          Spasi / Enter untuk ambil foto · Esc untuk tutup
        </p>
      </div>
    </div>
  );
}
