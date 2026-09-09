'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { boothLayout, placePhoto } from '../../lib/layout';
import { cellRadius } from '../../lib/render';
import type { BoothState, PhotoSlot, Rect } from '../../lib/types';
import { cameraCaptureSize } from './capture';

interface CameraPreviewProps {
  state: BoothState;
  activeCell: number | null;
  liveIndex: number | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  ready: boolean;
  mirror: boolean;
  showFrame: boolean;
  label: string;
}

function clipCell(ctx: CanvasRenderingContext2D, cell: Rect) {
  const radius = cellRadius(cell);
  const { x, y, w, h } = cell;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
}

export default function CameraPreview({ state, activeCell, liveIndex, videoRef, ready, mirror, showFrame, label }: CameraPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const [revision, setRevision] = useState(0);
  const [frameError, setFrameError] = useState(false);
  const [bounds, setBounds] = useState({ w: 1, h: 1 });
  const layout = useMemo(() => boothLayout(state), [state]);
  const view = activeCell === null ? { x: 0, y: 0, w: layout.w, h: layout.h } : layout.cells[activeCell];
  const scale = Math.min(bounds.w / view.w, bounds.h / view.h);
  const displayW = Math.max(1, view.w * scale);
  const displayH = Math.max(1, view.h * scale);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setBounds({ w: host.clientWidth, h: host.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFrameError(false);
    const sources = new Set(state.slots.map((slot) => slot.src).filter((src): src is string => !!src));
    if (state.frameSrc) sources.add(state.frameSrc);
    for (const cached of images.current.keys()) if (!sources.has(cached)) images.current.delete(cached);
    for (const src of sources) {
      if (images.current.has(src)) continue;
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        images.current.set(src, image);
        setRevision((value) => value + 1);
      };
      image.onerror = () => {
        if (!cancelled && src === state.frameSrc) setFrameError(true);
      };
      image.src = src;
    }
    return () => { cancelled = true; };
  }, [state.frameSrc, state.slots]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);
    let animation = 0;

    const draw = () => {
      ctx.setTransform(canvas.width / view.w, 0, 0, canvas.height / view.h, 0, 0);
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, view.w, view.h);
      // A close-up is a crop of the full composition, including only that cell's artwork.
      ctx.translate(-view.x, -view.y);
      layout.cells.forEach((cell, index) => {
        if (activeCell !== null && index !== activeCell) return;
        const slot = state.slots[index];
        const video = videoRef.current;
        const live = index === liveIndex;
        const source = live ? (ready && video && video.readyState >= 2 && video.videoWidth ? video : null) : slot?.src ? images.current.get(slot.src) : null;
        ctx.save();
        clipCell(ctx, cell);
        ctx.fillStyle = '#161616';
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        if (source) {
          const dimensions = source instanceof HTMLVideoElement
            ? cameraCaptureSize(source.videoWidth, source.videoHeight)
            : { w: source.naturalWidth, h: source.naturalHeight };
          const transform: Pick<PhotoSlot, 'zoom' | 'ox' | 'oy'> = live ? { zoom: 1, ox: 0, oy: 0 } : slot;
          const placed = placePhoto(dimensions.w, dimensions.h, cell, transform);
          if (live && mirror) {
            ctx.translate(placed.x + placed.w, placed.y);
            ctx.scale(-1, 1);
            ctx.drawImage(source, 0, 0, placed.w, placed.h);
          } else ctx.drawImage(source, placed.x, placed.y, placed.w, placed.h);
        } else {
          ctx.fillStyle = '#777777';
          ctx.font = `500 ${Math.min(cell.w, cell.h) * 0.075}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(live ? 'Menyiapkan kamera…' : `Foto ${index + 1}`, cell.x + cell.w / 2, cell.y + cell.h / 2);
        }
        ctx.restore();
      });
      const frame = state.frameSrc && showFrame ? images.current.get(state.frameSrc) : null;
      if (frame) ctx.drawImage(frame, 0, 0, layout.w, layout.h);
      if (liveIndex !== null && activeCell === null) {
        const cell = layout.cells[liveIndex];
        ctx.strokeStyle = '#ff7e1d';
        ctx.lineWidth = Math.max(3, Math.min(layout.w, layout.h) * 0.005);
        ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
      }
      if (liveIndex !== null) animation = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animation);
  }, [activeCell, displayH, displayW, layout, liveIndex, mirror, ready, revision, showFrame, state, videoRef, view.h, view.w, view.x, view.y]);

  return (
    <div ref={hostRef} className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} role="img" aria-label={label} style={{ width: displayW, height: displayH }} />
      {frameError && showFrame && <p className="absolute inset-x-3 bottom-3 rounded-lg bg-black/80 p-2 text-center text-xs text-amber-200">Pratinjau frame gagal dimuat. Foto tetap bisa diambil.</p>}
    </div>
  );
}
