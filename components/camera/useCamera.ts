'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CAMERA_FRAME_FRESHNESS_MS, canCaptureCameraFrame } from './readiness';

export function describeCameraError(error: unknown): string {
  if (!window.isSecureContext) return 'Kamera membutuhkan HTTPS atau localhost.';
  if (!navigator.mediaDevices?.getUserMedia) return 'Browser ini tidak mendukung kamera. Gunakan browser terbaru atau Upload.';
  switch ((error as { name?: string })?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Izin kamera ditolak. Izinkan kamera melalui ikon gembok di address bar, lalu coba lagi.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Kamera tidak ditemukan. Sambungkan kamera atau pilih perangkat lain.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Kamera sedang dipakai atau terputus. Tutup aplikasi kamera lain, lalu coba lagi.';
    default:
      return 'Tidak bisa membuka kamera. Coba lagi atau gunakan Upload.';
  }
}

export function useCamera(onUnavailable: (reason: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readyRef = useRef(false);
  const lastFrameRef = useRef(0);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    readyRef.current = false;
    lastFrameRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let ownedStream: MediaStream | null = null;
    let frameCallback = 0;
    let animationFrame = 0;
    let firstFrameTimeout = 0;
    let lastFrameAt = 0;
    let previousVideoTime = -1;
    const removeListeners: Array<() => void> = [];
    stop();
    video.srcObject = null;
    setReady(false);
    setError(null);

    const unavailable = (message: string) => {
      if (cancelled) return;
      readyRef.current = false;
      setReady(false);
      setError(message);
      unavailableRef.current(message);
    };

    const actualFrame = () => {
      const track = ownedStream?.getVideoTracks()[0];
      if (cancelled || streamRef.current !== ownedStream || video.srcObject !== ownedStream || !track || track.readyState !== 'live' || track.muted || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      lastFrameAt = performance.now();
      lastFrameRef.current = lastFrameAt;
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
        setError(null);
      }
    };

    const watchFrames = () => {
      if (cancelled) return;
      if (typeof video.requestVideoFrameCallback === 'function') {
        frameCallback = video.requestVideoFrameCallback(() => {
          actualFrame();
          watchFrames();
        });
      } else {
        animationFrame = requestAnimationFrame(() => {
          // Metadata/playing events alone do not prove the camera produced a frame.
          if (video.currentTime > previousVideoTime && previousVideoTime >= 0) actualFrame();
          previousVideoTime = video.currentTime;
          watchFrames();
        });
      }
    };

    const updateDevices = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(all.filter((device) => device.kind === 'videoinput'));
      } catch {
        // Device labels are optional; a working stream must remain usable.
      }
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        unavailable(describeCameraError(null));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        ownedStream = stream;
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (!track) throw new Error('No video track');
        const ended = () => unavailable('Kamera terputus. Sambungkan kembali, lalu pilih Coba kamera lagi.');
        const muted = () => unavailable('Gambar kamera terhenti. Pulihkan kamera sebelum melanjutkan.');
        track.addEventListener('ended', ended);
        track.addEventListener('mute', muted);
        removeListeners.push(() => {
          track.removeEventListener('ended', ended);
          track.removeEventListener('mute', muted);
        });
        video.srcObject = stream;
        watchFrames();
        firstFrameTimeout = window.setTimeout(() => {
          if (!cancelled && !lastFrameAt) unavailable('Kamera belum mengirim gambar. Periksa izin atau pilih Coba kamera lagi.');
        }, 12000);
        await video.play();
        if (!cancelled) void updateDevices();
      } catch (cause) {
        if (!cancelled) {
          clearTimeout(firstFrameTimeout);
          ownedStream?.getTracks().forEach((track) => track.stop());
          unavailable(describeCameraError(cause));
          void updateDevices();
        }
      }
    };
    void start();
    navigator.mediaDevices?.addEventListener('devicechange', updateDevices);
    const watchdog = window.setInterval(() => {
      if (readyRef.current && !document.hidden && lastFrameAt && performance.now() - lastFrameAt >= CAMERA_FRAME_FRESHNESS_MS) {
        unavailable('Gambar kamera terhenti. Pulihkan kamera sebelum melanjutkan.');
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(firstFrameTimeout);
      clearInterval(watchdog);
      cancelAnimationFrame(animationFrame);
      if (typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(frameCallback);
      removeListeners.forEach((remove) => remove());
      navigator.mediaDevices?.removeEventListener('devicechange', updateDevices);
      ownedStream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === ownedStream) {
        streamRef.current = null;
        readyRef.current = false;
      }
      if (video.srcObject === ownedStream) video.srcObject = null;
    };
  }, [attempt, deviceId, stop]);

  const retry = useCallback(() => {
    stop();
    setReady(false);
    setAttempt((value) => value + 1);
  }, [stop]);

  const selectDevice = useCallback((id: string) => {
    stop();
    setReady(false);
    setDeviceId(id);
    setAttempt((value) => value + 1);
  }, [stop]);

  const canCapture = useCallback(() => canCaptureCameraFrame({
    video: videoRef.current,
    stream: streamRef.current,
    ready: readyRef.current,
    lastFrameAt: lastFrameRef.current,
    now: performance.now(),
    hidden: document.hidden,
  }), []);

  return { videoRef, ready, error, devices, deviceId, selectDevice, retry, canCapture, stop };
}
