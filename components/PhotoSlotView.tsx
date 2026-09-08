'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PhotoSlot, Rect } from '../lib/types';
import { MAX_ZOOM, MIN_ZOOM, clamp, placePhoto } from '../lib/layout';
import { cellRadius } from '../lib/render';
import { ArrowLeftIcon, ArrowRightIcon, CameraIcon, TrashIcon, UploadIcon } from './icons';

// natural sizes are cached so re-renders never flash the placeholder
const dimsCache = new Map<string, { w: number; h: number }>();

function useNaturalSize(src: string | null) {
  const [dims, setDims] = useState(() => (src ? dimsCache.get(src) ?? null : null));
  useEffect(() => {
    if (!src) {
      setDims(null);
      return;
    }
    const cached = dimsCache.get(src);
    if (cached) {
      setDims(cached);
      return;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      const d = { w: img.naturalWidth, h: img.naturalHeight };
      dimsCache.set(src, d);
      if (alive) setDims(d);
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return dims;
}

interface PhotoSlotViewProps {
  slot: PhotoSlot;
  index: number;
  total: number;
  /** cell geometry in export pixels */
  cell: Rect;
  /** preview px per export px */
  scale: number;
  active: boolean;
  onActivate: () => void;
  onAdjust: (patch: Partial<PhotoSlot>) => void;
  onCapture: () => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

export default function PhotoSlotView({
  slot,
  index,
  total,
  cell,
  scale,
  active,
  onActivate,
  onAdjust,
  onCapture,
  onUpload,
  onRemove,
  onMove,
}: PhotoSlotViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dims = useNaturalSize(slot.src);
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);

  const local: Rect = { x: 0, y: 0, w: cell.w, h: cell.h };
  const placed = dims ? placePhoto(dims.w, dims.h, local, slot) : null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onUpload(file);
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      onActivate();
      if (!slot.src || e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      panRef.current = { x: e.clientX, y: e.clientY, ox: slot.ox, oy: slot.oy, moved: false };
      setPanning(true);
    },
    [slot.src, slot.ox, slot.oy, onActivate],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pan = panRef.current;
      if (!pan || !placed) return;
      // preview px → export px → fraction of overflow
      const dx = (e.clientX - pan.x) / scale;
      const dy = (e.clientY - pan.y) / scale;
      if (Math.abs(dx) + Math.abs(dy) > 2) pan.moved = true;
      const patch: Partial<PhotoSlot> = {};
      if (placed.overX > 0) patch.ox = clamp(pan.ox - dx / placed.overX, -1, 1);
      if (placed.overY > 0) patch.oy = clamp(pan.oy - dy / placed.overY, -1, 1);
      if (Object.keys(patch).length) onAdjust(patch);
    },
    [placed, scale, onAdjust],
  );

  const endPan = useCallback(() => {
    panRef.current = null;
    setPanning(false);
  }, []);

  // wheel zoom needs a non-passive listener to prevent page scroll
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !slot.src) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = clamp(slot.zoom * (e.deltaY < 0 ? 1.05 : 1 / 1.05), MIN_ZOOM, MAX_ZOOM);
      if (next !== slot.zoom) {
        onActivate();
        onAdjust({ zoom: next });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [slot.src, slot.zoom, onAdjust, onActivate]);

  const radius = cellRadius(cell) * scale;
  const canPan = !!placed && (placed.overX > 0 || placed.overY > 0);
  const [dropping, setDropping] = useState(false);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`Foto ${index + 1}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onUpload(file);
      }}
      className={`group absolute inset-0 select-none overflow-hidden transition-shadow ${
        dropping
          ? 'ring-2 ring-accent'
          : active
            ? 'ring-2 ring-brand ring-offset-1 ring-offset-ink-950'
            : 'ring-1 ring-white/10'
      } ${slot.src ? (canPan ? (panning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default') : 'cursor-pointer'}`}
      style={{
        borderRadius: radius,
        background: '#141414',
        touchAction: 'none',
      }}
    >
      {slot.src ? (
        <img
          src={slot.src}
          alt={`Foto ${index + 1}`}
          draggable={false}
          className="pointer-events-none absolute max-w-none"
          style={
            placed
              ? {
                  left: `${(placed.x / cell.w) * 100}%`,
                  top: `${(placed.y / cell.h) * 100}%`,
                  width: `${(placed.w / cell.w) * 100}%`,
                  height: `${(placed.h / cell.h) * 100}%`,
                }
              : { inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
          }
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-3 text-center text-ink-600">
          <span className="text-xs font-semibold uppercase tracking-wider">Foto {index + 1}</span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCapture();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-ink-950 shadow hover:bg-brand-bright"
            >
              <CameraIcon size={14} /> Kamera
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20"
            >
              <UploadIcon size={14} /> Upload
            </button>
          </div>
        </div>
      )}

      {slot.src && (
        <>
          <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white/90">
            {index + 1}
          </div>
          <div
            className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/75 to-transparent p-2.5 transition-opacity ${
              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            } ${panning ? 'pointer-events-none opacity-0' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ToolButton title="Pindah ke kiri/atas" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowLeftIcon size={15} />
            </ToolButton>
            <ToolButton
              title="Pindah ke kanan/bawah"
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            >
              <ArrowRightIcon size={15} />
            </ToolButton>
            <span className="mx-1 h-4 w-px bg-white/20" />
            <ToolButton title="Foto ulang dengan kamera" onClick={onCapture}>
              <CameraIcon size={15} />
            </ToolButton>
            <ToolButton title="Ganti dengan upload" onClick={() => fileRef.current?.click()}>
              <UploadIcon size={15} />
            </ToolButton>
            <ToolButton title="Hapus foto" danger onClick={onRemove}>
              <TrashIcon size={15} />
            </ToolButton>
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function ToolButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded-lg bg-white/15 p-1.5 text-white backdrop-blur transition disabled:opacity-30 ${
        danger ? 'hover:bg-red-500/70' : 'hover:bg-white/30'
      }`}
    >
      {children}
    </button>
  );
}
