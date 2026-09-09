import type { FrameRatio } from './types';
import { loadImage } from './render';
import { exportSize } from './layout';

/** Working-copy photo size: enough for a full-quality 1920×1080 export. */
export const PHOTO_MAX_DIM = 1280;
export const PHOTO_QUALITY = 0.86;

/** Frames are stored as PNG (alpha) at export width. */
export const FRAME_MAX_DIM = 1920;

export function detectFrameRatio(img: { width: number; height: number }): FrameRatio {
  for (const ratio of ['16:9', '9:16', '1:3'] as FrameRatio[]) {
    const size = exportSize(ratio);
    if (Math.abs(img.width / img.height - size.w / size.h) < 0.002) return ratio;
  }
  throw new Error('Rasio frame harus 16:9, 9:16, atau 1:3. Gunakan template yang tersedia.');
}

export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

/** Downscale + re-encode a loaded image. */
export function resizeImage(
  img: HTMLImageElement,
  maxDim: number,
  mimeType: 'image/jpeg' | 'image/png',
  quality?: number,
): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  if (mimeType === 'image/jpeg') {
    // JPEG has no alpha; avoid black fill for transparent sources
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(mimeType, quality);
}

export async function compressDataURL(
  src: string,
  maxDim: number,
  quality: number,
): Promise<string> {
  const img = await loadImage(src);
  return resizeImage(img, maxDim, 'image/jpeg', quality);
}

/** Photo upload/capture → compact JPEG dataURL for the working state. */
export async function fileToPhotoDataURL(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('File bukan gambar');
  const img = await loadImage(await fileToDataURL(file));
  return resizeImage(img, PHOTO_MAX_DIM, 'image/jpeg', PHOTO_QUALITY);
}

/** Frame upload → PNG dataURL (keeps transparency) + detected ratio. */
export async function fileToFrame(file: File, expectedRatio?: FrameRatio): Promise<{ src: string; ratio: FrameRatio }> {
  if (file.type !== 'image/png') throw new Error('Frame harus berupa PNG transparan');
  if (file.size > 10 * 1024 * 1024) throw new Error('Frame maksimal 10 MB');
  const img = await loadImage(await fileToDataURL(file));
  const ratio = detectFrameRatio(img);
  const size = exportSize(expectedRatio ?? ratio);
  if (ratio !== (expectedRatio ?? ratio) || img.naturalWidth !== size.w || img.naturalHeight !== size.h) {
    throw new Error(`Frame harus ${size.w}×${size.h}px untuk layout ini. Unduh template terlebih dahulu.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, size.w, size.h).data;
  let transparent = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] === 0) { transparent = true; break; }
  }
  if (!transparent) throw new Error('Frame tidak memiliki jendela transparan. Jangan upload gambar panduan.');
  return { src: canvas.toDataURL('image/png'), ratio };
}

export function dataURLtoBlob(dataURL: string): Blob {
  const [meta, b64] = dataURL.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] || 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Approximate byte size of a dataURL payload. */
export function dataURLBytes(dataURL: string): number {
  const i = dataURL.indexOf(',');
  return Math.floor(((dataURL.length - i - 1) * 3) / 4);
}
