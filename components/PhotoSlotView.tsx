'use client';

import React, { useRef, useState, useCallback } from 'react';
import type { PhotoSlot } from '../lib/types';
import { CameraIcon, UploadIcon } from './icons';

interface PhotoSlotViewProps {
  slot: PhotoSlot;
  index: number;
  onPhotoChange: (src: string) => void;
  onAdjust: (patch: Partial<PhotoSlot>) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
  onCapture: (index: number) => void;
  isDragging: boolean;
  active: boolean;
  onActivate: () => void;
}

export default function PhotoSlotView({
  slot,
  index,
  onPhotoChange,
  onAdjust,
  onDragStart,
  onDragOver,
  onDrop,
  onCapture,
  isDragging,
  active,
  onActivate,
}: PhotoSlotViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [panning, setPanning] = useState<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onPhotoChange(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!slot.src) return;
      onActivate();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setPanning({ x: e.clientX, y: e.clientY, ox: slot.ox, oy: slot.oy });
    },
    [slot.src, slot.ox, slot.oy, onActivate],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panning) return;
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - panning.x) / rect.width;
      const dy = (e.clientY - panning.y) / rect.height;
      onAdjust({ ox: clamp(panning.ox - dx, -1, 1), oy: clamp(panning.oy - dy, -1, 1) });
    },
    [panning, onAdjust],
  );

  const onPointerUp = useCallback(() => setPanning(null), []);

  return (
    <div
      draggable={!!slot.src}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={() => !slot.src && onActivate()}
      className={`group relative overflow-hidden rounded-xl border transition-all select-none ${
        active
          ? 'border-brand shadow-[0_0_0_2px_rgba(255,126,29,0.6)]'
          : 'border-ink-700 hover:border-ink-600'
      } ${isDragging ? 'opacity-40 scale-95' : ''} ${slot.src ? 'grabbable' : ''}`}
      style={{ aspectRatio: '1 / 1', background: '#101010' }}
    >
      {slot.src ? (
        <img
          src={slot.src}
          draggable={false}
          alt={`Foto ${index + 1}`}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{
            transform: `scale(${slot.zoom}) translate(${-slot.ox * 20}%, ${-slot.oy * 20}%)`,
            transformOrigin: 'center',
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-ink-600">
          <CameraIcon size={28} />
          <span className="text-xs font-medium">Foto {index + 1}</span>
        </div>
      )}

      {/* hover actions */}
      {slot.src && (
        <div className="absolute inset-0 flex items-end justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCapture(index);
            }}
            className="rounded-lg bg-white/15 p-2 backdrop-blur hover:bg-white/25"
            title="Ganti foto"
          >
            <CameraIcon size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              fileRef.current?.click();
            }}
            className="rounded-lg bg-white/15 p-2 backdrop-blur hover:bg-white/25"
            title="Upload foto"
          >
            <UploadIcon size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPhotoChange('');
            }}
            className="rounded-lg bg-white/15 p-2 backdrop-blur hover:bg-red-500/60"
            title="Hapus"
          >
            <span className="text-xs">✕</span>
          </button>
        </div>
      )}

      {/* empty overlay actions */}
      {!slot.src && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={() => onCapture(index)}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-ink-950 hover:bg-brand-bright"
          >
            <CameraIcon size={14} /> Kamera
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20"
          >
            <UploadIcon size={14} /> Upload
          </button>
        </div>
      )}

      {/* drag badge */}
      {slot.src && (
        <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white/80">
          {index + 1}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
