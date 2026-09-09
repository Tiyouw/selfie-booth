'use client';

import type { BoothState, FrameRatio, GridCount } from '../lib/types';
import { boothLayout } from '../lib/layout';

function Miniature({ ratio, count }: { ratio: FrameRatio; count: GridCount }) {
  const { w, h, cells } = boothLayout({ frameRatio: ratio, grid: count, frameSrc: null, slots: [], layoutVersion: 2 });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full" aria-hidden="true">
      <rect width={w} height={h} rx={25} fill="currentColor" opacity="0.12" />
      {cells.map((cell, i) => <rect key={i} x={cell.x} y={cell.y} width={cell.w} height={cell.h} rx={12} fill="currentColor" />)}
    </svg>
  );
}

export default function LayoutChoices({ state, locked, onRatio, onCount }: {
  state: BoothState; locked: boolean;
  onRatio: (ratio: FrameRatio) => void; onCount: (count: GridCount) => void;
}) {
  const choices = [
    { ratio: '16:9', label: 'Landscape', count: 4 },
    { ratio: '9:16', label: 'Portrait', count: 3 },
    { ratio: '1:3', label: 'Photo Strip', count: 3 },
  ] as const;
  const counts: GridCount[] = state.frameRatio === '16:9' ? [1, 2, 3, 4] : [1, 2, 3];
  const style = (selected: boolean) => `flex flex-col items-center justify-center gap-2 rounded-xl border p-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-brand bg-brand/10 text-brand' : 'border-white/10 text-ink-600 hover:border-white/30'}`;
  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {choices.map(({ ratio, label, count }) => (
          <button key={ratio} type="button" disabled={locked} aria-pressed={state.frameRatio === ratio}
            onClick={() => onRatio(ratio)} className={style(state.frameRatio === ratio)}>
            <Miniature ratio={ratio} count={count} />
            <span>{label}</span><span className="font-normal opacity-70">{ratio}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${counts.length}, minmax(0, 1fr))` }}>
        {counts.map((count) => (
          <button key={count} type="button" disabled={locked} aria-pressed={state.grid === count}
            onClick={() => onCount(count)} className={style(state.grid === count)}>
            <Miniature ratio={state.frameRatio} count={count} /><span>{count} Foto</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-600">
        {locked ? 'Layout mengikuti frame custom. Pilih frame bawaan atau Tanpa untuk mengubah.'
          : state.frameRatio === '16:9' ? 'Rekomendasi: 4 foto untuk susunan 2×2 yang simetris.'
          : state.frameRatio === '1:3' ? 'Rekomendasi: 3 foto untuk strip vertikal bergaya photobooth.'
          : 'Foto tersusun vertikal, cocok untuk layar ponsel dan Stories.'}
      </p>
      {state.layoutVersion === 1 && state.frameRatio === '9:16' && state.grid === 3 && (
        <p className="mt-2 text-xs text-amber-300">Desain lama dipertahankan. Pilih 3 Foto untuk susunan vertikal baru.</p>
      )}
    </>
  );
}
