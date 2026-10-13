# Fase 1 — GIF strip animasi (client-side)

Buat GIF dari strip yang sudah jadi: foto muncul satu per satu ke posisinya,
diakhiri strip lengkap dengan frame. Sepenuhnya di browser — tanpa backend,
tanpa mengubah `BoothState`, draft, atau payload share.

## Perilaku

- Urutan frame: strip kosong → foto 1 → foto 1–2 → … → strip lengkap (dengan
  frame overlay). Frame terakhir ditahan lebih lama sebelum loop mengulang.
- Hanya foto terisi yang dianimasikan, sesuai urutan slot; slot kosong tetap
  kotak gelap seperti render PNG.
- Loop tanpa batas (`loop: 0`), tanpa watermark.

## Timeline (fungsi murni)

```ts
// lib/gif.ts
export interface GifFrameSpec { photoCount: number; delayMs: number; }

/** photoCount = jumlah foto terisi yang sudah "muncul" (urut slot). */
export function gifTimeline(filledCount: number): GifFrameSpec[];
// 0 foto → lempar Error (UI hanya mengaktifkan tombol bila ≥ 1 foto)
// N foto → [{0, 400}, {1, 600}, …, {N, 600}, {N, 2000}]
```

Frame terakhir identik bitmap-nya dengan reveal terakhir; GIF mendukung delay
berbeda per frame, jadi "hold" akhir hampir gratis di resolusi 480 px.

## Ukuran & resolusi

- Sisi panjang 480 px: 16:9 → 480×270, 9:16 → 270×480, 1:3 → 160×480.
  Hasil ≈ 1–3 MB untuk 4 foto — cukup tajam untuk chat dan status.
- Palet 256 warna **per frame** (bukan palet global) — foto berwarna beragam
  dan frame Neon sama-sama aman.
- Geometri memakai `boothLayout`/`placePhoto` dari `lib/layout.ts` dengan
  skala `480 / max(w, h)` dari `exportSize(ratio)`. Foto digambar langsung di
  resolusi GIF (bukan render 1920 px lalu diperkecil — lebih cepat, hasil sama).

## Modul

`lib/gif.ts` (baru):

- `gifTimeline` dan `gifSize(ratio, longSide = 480)` — murni, diuji di node.
- `renderBoothGifBlob(state, opts?): Promise<Blob>` — browser-only. Muat tiap
  `slot.src` sekali (`loadImage`), gambar tiap frame sesuai timeline (latar
  `#0d0d0d`, sel kosong `#161616`, sudut bulat `cellRadius` — meniru
  `renderBoothCanvas`), lalu encode dan kembalikan `Blob` (`image/gif`).

Alur encode per frame dengan gifenc:

```
getImageData → quantize(rgba, 256) → applyPalette → writeFrame(index, w, h, {palette, delay})
```

Sisipkan `await` macro-task (mis. `setTimeout 0`) antar frame agar UI tetap
responsif selama encode; tampilkan state busy di tombol.

## Dependensi

`gifenc` (±10 KB, tanpa dependensi, aktif dirawat). Dibanding gif.js (worker
lama, tidak terawat) dan ffmpeg.wasm (±30 MB, berlebihan), gifenc paling pas:
API sinkron sederhana + palet per frame. Tambahkan ke `dependencies` root.

## Integrasi UI

- `app/page.tsx`: handler `handleDownloadGif` mengikuti pola `handleDownload`
  (busy `'gif'`, toast sukses/gagal, nama `selfie-booth-<timestamp>.gif`).
- `components/ShareModal.tsx` bagian "Hasil gambar": tambah tombol
  **Download GIF** dan **Bagikan GIF** (`navigator.canShare({files:[File]})`
  dengan `type: 'image/gif'`, pola sama dengan `handleShareImage`; fallback
  unduh).
- Tombol GIF disabled bila belum ada foto; disabled juga selama busy.
- Fase 2 nanti: GIF yang sama diunggah bersama design untuk link pendek.

## Yang tidak berubah

- `BoothState`, autosave draft, `encodeState`, hash link — GIF dibuat
  on-demand saat unduh/share, tidak pernah disimpan di state/localStorage.
- Sesi kamera, template, export PNG.

## Tes & verifikasi

- `tests/core-gif.cjs`: timeline (jumlah frame, delay, kasus 1/3/4 foto,
  tolak 0 foto) dan `gifSize` untuk tiga rasio.
- Manual: unduh GIF di Android/iOS, buka di penampil GIF (loop & delay benar),
  Web Share GIF ke WhatsApp, ukuran ≤ 3 MB, encode ≤ 3 s di ponsel menengah
  (bila lebih, turunkan `longSide` ke 360).
