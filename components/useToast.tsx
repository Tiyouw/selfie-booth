'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

type Tone = 'info' | 'success' | 'error';

export function useToast() {
  const [toast, setToast] = useState<{ text: string; tone: Tone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: Tone = 'info', ms = 2400) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, tone });
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { toast, show };
}

export function Toast({ toast }: { toast: { text: string; tone: Tone } | null }) {
  if (!toast) return null;
  const tone =
    toast.tone === 'error'
      ? 'bg-red-500 text-white'
      : toast.tone === 'success'
        ? 'bg-emerald-500 text-ink-950'
        : 'bg-cream text-ink-950';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast-in fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-xl ${tone}`}
    >
      {toast.text}
    </div>
  );
}
