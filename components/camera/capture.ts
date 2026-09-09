import { PHOTO_MAX_DIM, PHOTO_QUALITY } from '../../lib/image';

export function cameraCaptureSize(width: number, height: number): { w: number; h: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Ukuran gambar kamera tidak valid.');
  const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export function captureCameraPhoto(video: HTMLVideoElement, mirror: boolean): string {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error('Kamera belum mengirim gambar.');
  const { w, h } = cameraCaptureSize(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser tidak bisa mengambil foto.');
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  const src = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
  if (!src.startsWith('data:image/jpeg;base64,')) throw new Error('Browser tidak bisa menyimpan foto.');
  return src;
}
