import type { BoothState } from './types';
import { boothLayout, gridGap, photoInset } from './layout';
import { findBuiltinFrame } from './frames';
import { downloadBlob } from './image';

export const TEMPLATE_SAFE_INSET = 24;
export const TEMPLATE_BACKGROUND = '#0d0d0d';

const labelNumber = (n: number) => String(Math.round(n * 1000) / 1000);

/** An editing reference only: never import this annotated SVG as an overlay. */
export function buildTemplateGuide(state: BoothState): string {
  const { w, h, cells } = boothLayout(state);
  const safe = TEMPLATE_SAFE_INSET;
  const inset = photoInset(state, w, h);
  const gap = gridGap(w, h);
  const frame = findBuiltinFrame(state.frameSrc);
  const frameLabel = frame ? `${frame.name} (${frame.id})` : state.frameSrc ? 'Kustom' : 'Tanpa bingkai';
  const metadata = JSON.stringify({
    ratio: state.frameRatio,
    grid: state.grid,
    layoutVersion: state.layoutVersion ?? 1,
    frameId: frame?.id ?? null,
    inset,
    gap,
    cells,
  });
  const windows = cells.map((cell, i) => {
    const x = cell.x + 16;
    const y = cell.y + cell.h / 2 - 24;
    return `<g data-slot="${i + 1}">
<rect x="${cell.x}" y="${cell.y}" width="${cell.w}" height="${cell.h}" fill="#ffffff" stroke="#2563eb" stroke-width="2"/>
<text x="${x}" y="${y}" fill="#1e40af" font-size="20" font-weight="700">Foto ${i + 1}</text>
<text x="${x}" y="${y + 28}" fill="#334155" font-size="16">x=${labelNumber(cell.x)}  y=${labelNumber(cell.y)}</text>
<text x="${x}" y="${y + 52}" fill="#334155" font-size="16">w=${labelNumber(cell.w)}  h=${labelNumber(cell.h)} px</text>
</g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif">
<title>Panduan template Selfie Booth — ${w} × ${h}, ${state.grid} foto</title>
<desc>Koordinat dalam piksel ukuran ekspor, dihitung dari sudut kiri atas. Area aman 24 px direkomendasikan untuk teks dan logo, bukan bleed cetak. Kotak biru adalah jendela foto transparan. Hapus semua anotasi panduan sebelum mengekspor desain sebagai PNG.</desc>
<metadata id="selfie-booth-template">${metadata}</metadata>
<rect width="${w}" height="${h}" fill="#e2e8f0"/>
${windows}
<rect x="${safe}" y="${safe}" width="${w - safe * 2}" height="${h - safe * 2}" fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="10 8"/>
<rect x="${safe + 6}" y="${safe + 6}" width="540" height="144" rx="4" fill="#fff7ed" fill-opacity="0.95"/>
<text x="${safe + 16}" y="${safe + 29}" fill="#9a3412" font-size="16">Area aman: 24 px — rekomendasi, bukan bleed cetak</text>
<text x="${safe + 16}" y="${safe + 51}" fill="#9a3412" font-size="14">${w} × ${h} px · ${state.grid} foto · Panduan, bukan bingkai</text>
<text x="${safe + 16}" y="${safe + 73}" fill="#9a3412" font-size="14">Jarak antar foto: ${gap} px${state.grid === 1 ? ' (tidak dipakai untuk 1 foto)' : ''}</text>
<text x="${safe + 16}" y="${safe + 95}" fill="#9a3412" font-size="14">Margin luar — atas: ${labelNumber(inset.top)} px · kanan: ${labelNumber(inset.right)} px</text>
<text x="${safe + 16}" y="${safe + 117}" fill="#9a3412" font-size="14">Margin luar — bawah: ${labelNumber(inset.bottom)} px · kiri: ${labelNumber(inset.left)} px</text>
<text x="${safe + 16}" y="${safe + 139}" fill="#9a3412" font-size="14">Bingkai dasar: ${frameLabel}</text>
</svg>`;
}

function filename(state: BoothState, kind: 'panduan.svg' | 'dasar.png'): string {
  const { w, h } = boothLayout(state);
  const inset = photoInset(state, w, h);
  const frameId = findBuiltinFrame(state.frameSrc)?.id ?? (state.frameSrc ? 'kustom' : 'tanpa-bingkai');
  const margins = [inset.top, inset.right, inset.bottom, inset.left].join('-');
  return `selfie-booth-${state.frameRatio.replace(':', 'x')}-${state.grid}-foto-${frameId}-inset-${margins}-v${state.layoutVersion ?? 1}-${kind}`;
}

export function downloadTemplateGuide(state: BoothState): void {
  downloadBlob(new Blob([buildTemplateGuide(state)], { type: 'image/svg+xml;charset=utf-8' }), filename(state, 'panduan.svg'));
}

/** Solid border and gutters, with exact, unannotated transparent photo windows. */
export async function downloadTemplatePNG(state: BoothState): Promise<void> {
  const { w, h, cells } = boothLayout(state);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  ctx.fillStyle = TEMPLATE_BACKGROUND;
  ctx.fillRect(0, 0, w, h);
  for (const cell of cells) ctx.clearRect(cell.x, cell.y, cell.w, cell.h);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Gagal membuat template PNG')), 'image/png');
  });
  downloadBlob(blob, filename(state, 'dasar.png'));
}
