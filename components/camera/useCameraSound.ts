'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SOUND_KEY = 'selfie-booth.camera-sound';

export function useCameraSound() {
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true);
  const contextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef(new Set<AudioScheduledSourceNode>());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOUND_KEY);
      enabledRef.current = saved !== 'off';
      setEnabled(enabledRef.current);
    } catch {
      // Private browsing can disable storage.
    }
  }, []);

  const silence = useCallback(() => {
    nodesRef.current.forEach((node) => {
      try { node.stop(); } catch { /* Already stopped. */ }
      node.disconnect();
    });
    nodesRef.current.clear();
  }, []);

  const initialize = useCallback(() => {
    try {
      const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      if (!contextRef.current || contextRef.current.state === 'closed') contextRef.current = new Audio();
      if (contextRef.current.state === 'suspended') void contextRef.current.resume().catch(() => {});
    } catch {
      // Sound is optional; camera capture never depends on audio support.
    }
  }, []);

  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    if (!next) silence();
    else if (contextRef.current) initialize();
    try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* Storage is optional. */ }
  }, [initialize, silence]);

  const play = useCallback((shutter: boolean, last = false) => {
    const ctx = contextRef.current;
    if (!enabledRef.current || !ctx || ctx.state === 'closed') return;
    try {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      const duration = shutter ? 0.14 : 0.12;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(shutter ? 0.16 : 0.09, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      gain.connect(ctx.destination);
      let source: AudioScheduledSourceNode;
      if (shutter) {
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        source = noise;
      } else {
        const oscillator = ctx.createOscillator();
        oscillator.frequency.value = last ? 1100 : 740;
        oscillator.type = 'sine';
        source = oscillator;
      }
      source.connect(gain);
      nodesRef.current.add(source);
      source.onended = () => {
        nodesRef.current.delete(source);
        source.disconnect();
        gain.disconnect();
      };
      source.start(now);
      source.stop(now + duration);
    } catch {
      // Browser audio failures must not interrupt the countdown.
    }
  }, []);

  const beep = useCallback((last: boolean) => play(false, last), [play]);
  const shutter = useCallback(() => play(true), [play]);

  const close = useCallback(() => {
    silence();
    const ctx = contextRef.current;
    contextRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }, [silence]);
  useEffect(() => close, [close]);

  return { enabled, toggle, initialize, beep, shutter, silence, close };
}
