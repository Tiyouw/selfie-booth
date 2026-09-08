import type { FrameRatio } from './types';
import { loadImage } from './render';

/** Working-copy photo size: enough for a full-quality 1920×1080 export. */
export const PHOTO_MAX_DIM = 1280;
export const PHOTO_QUALITY = 0.86;

/** Frames are stored as PNG (alpha) at export width. */
export const FRAME_MAX_DIM = 1920;

export function detectFrameRatio(img: { width: number; height: number }): FrameRatio {
  return img.width / img.height >= 1.2 ? '16:9' : '9:16';
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
export async function fileToFrame(file: File): Promise<{ src: string; ratio: FrameRatio }> {
  if (file.type !== 'image/png') throw new Error('Frame harus berupa PNG transparan');
  const img = await loadImage(await fileToDataURL(file));
  return { src: resizeImage(img, FRAME_MAX_DIM, 'image/png'), ratio: detectFrameRatio(img) };
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
