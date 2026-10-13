# Fase 3 — Boomerang per foto (burst capture)

GIF strip (fase 1) menghidupkan hasil akhir; boomerang menghidupkan momen
pengambilan: 8 frame berurutan saat jepretan, diputar maju-mundur. GIF strip
tetap output utama; boomerang adalah output tambahan per foto.

## Capture

- Toggle **Boomerang** di layar setup `CameraModal` (default mati). Saat
  aktif, fase `capturing` mengambil 8 frame dari elemen video yang sama dengan
  interval ±110 ms (target 8 fps selama ±1 detik) di samping foto utama.
- Frame disimpan sebagai JPEG data URL, sisi panjang 360 px, kualitas 0.75
  (±30 KB/frame → ±250 KB/foto — aman di memori).
- Foto utama untuk slot tetap frame tengah burst (ke-4) — konsisten dengan
  alur retake yang ada.

## Penyimpanan: memori sesi saja

- Frame hidup di state `CameraModal` (`frames: Record<slotIndex, string[]>`),
  **bukan** `BoothState`, **bukan** `localStorage`, **bukan** payload share.
  Reload halaman = boomerang hilang, strip statis tetap utuh — degradasi yang
  disengaja agar draft tidak membengkak.
- Retake membuang frame slot itu; pause/resume tidak menyentuh frame yang
  sudah terkumpul; "Pakai semua" memasukkan foto utama seperti biasa, frame
  tetap tersedia untuk unduhan/share sampai modal ditutup.
- Batas memori: maks 4 slot × 8 frame (±1 MB total); slot tertua dibuang bila
  terlampaui.

## Export & share

- `lib/gif.ts` bertambah `renderBoomerangBlob(frames, opts?)`: 360 px, frame
  maju + mundur (8 + 7 = 15 frame, delay 90 ms), palet per frame — builder
  GIF sama dengan fase 1.
- Review menampilkan preview beranimasi (loop 8 fps) untuk slot yang punya
  frame, menggantikan foto statis sementara.
- UI hasil: tombol kecil **GIF** pada slot yang punya frame (menu slot di
  `PhotoSlotView`) → unduh. `ShareModal` menawarkan "GIF boomerang" bila
  frame masih ada di sesi.
- Upload: field `gif` multipart fase 2 diisi boomerang **atau** GIF strip
  (satu GIF per design). GIF strip tetap bisa diunduh manual dari editor.
- Fungsi murni `buildBoomerangTimeline(n)` dipisah agar bisa diuji di node.

## Yang tidak berubah

- `BoothState`, draft, `session.ts` reducer — reducer tetap tidak tahu
  keberadaan frame (isolasi: frame dikelola komponen modal).
- Sesi tanpa toggle boomerang berjalan persis seperti sekarang.

## Tes & verifikasi

- Unit: `buildBoomerangTimeline` (15 frame, urutan maju-mundur, delay),
  pemilihan frame utama, pembuangan frame pada retake.
- Manual: boomerang mulus di review; retake mengganti frame; reload tidak
  meninggalkan jejak di localStorage (cek tab Application); GIF boomerang
  terbuka di WhatsApp; kamera lambat (≤5 fps efektif) tetap menghasilkan GIF
  yang wajar.
