# Selfie Booth — Deploy Guide

Panduan deployment dan pemeriksaan aplikasi Selfie Booth.

## Struktur

```
selfie-booth/
├── app/            # Next.js App Router
│   ├── layout.tsx  # font Poppins + metadata
│   ├── page.tsx    # halaman utama + semua kontrol
│   └── globals.css # styling dark theme ala himasif.id
├── components/     # PhotoSlotView, CameraModal, ShareModal, icons, useToast
├── lib/            # types, layout, state, share, render, image, frames, template
├── public/frames/  # frame built-in (SVG)
├── scripts/        # gen-frames.py (regenerate frame default)
├── docs/           # TEMPLATES.md; ROADMAP.md + desain per fase (GIF_STRIP, SHARE_BACKEND, BOOMERANG, EVENT_GALLERY)
├── tests/          # tes core; tes kamera di components/camera/
└── package.json
```

## Cara Deploy ke Vercel

### Opsi A — Vercel CLI (direkomendasikan, cepat)

```bash
cd /workspace/selfie-booth
npx vercel login          # login sekali
npx vercel --prod         # deploy produksi
npx vercel domains add selfie.tiyoouw.app   # pasang domain
```

### Opsi B — Via GitHub + Vercel Dashboard

1. Push repo ini ke GitHub:
   ```bash
   cd /workspace/selfie-booth
   git remote add origin https://github.com/<USER>/selfie-booth.git
   git push -u origin main
   ```
2. Buka https://vercel.com → **Add New → Project** → import repo `selfie-booth`
3. Framework: **Next.js** (terdeteksi otomatis), biarkan default
4. Deploy

Untuk deployment otomatis, gunakan integrasi GitHub di Vercel. Jangan tempel token
ke chat atau simpan kredensial di repository.

## DNS — selfie.tiyoouw.app

**Arahkan langsung ke Vercel (bypass VPS/Traefik, paling hemat):**

Di provider DNS tempat `tiyoouw.app` dikelola (Cloudflare?):

| Type | Name/Host | Value |
|---|---|---|
| `CNAME` | `selfie` | `cname.vercel-dns.com` |

> Setelah deploy, Vercel akan kasih URL production (misal `selfie-booth-xxx.vercel.app`).
> Di Vercel dashboard: **Project → Settings → Domains → Add** `selfie.tiyoouw.app`,
> lalu ikuti instruksi (Vercel akan validasi CNAME di atas).

Kalau DNS `*.tiyoouw.app` ternyata di-point ke IP VPS, maka untuk
subdomain `selfie` kamu perlu **override dengan CNAME ke Vercel** (atau hapus wildcard
untuk subdomain ini). CNAME spesifik selalu menang atas wildcard.

## Catatan Teknis

- **Frame built-in**: SVG di `public/frames/`, terdaftar di `lib/frames.ts`
  (`inset` = area transparan tempat foto diletakkan). Tambah frame baru: taruh
  PNG/SVG 1920×1080, 1080×1920, atau 640×1920, lalu tambahkan entri di `BUILTIN_FRAMES`.
  Frame default bisa di-regenerate dengan `python3 scripts/gen-frames.py`.
- **Share link**: set `NEXT_PUBLIC_SHARE_API` untuk memakai backend VPS + link
  pendek `/s/:id`, viewer, OG image, dan QR. `SHARE_API` dapat mengatur alamat API
  untuk viewer server-side. Tanpa API, atau saat API gagal, desain memakai URL
  hash (`#d=…`, lz-string). Foto dikecilkan ke 720px; link hash panjang tetap
  dapat terpotong oleh aplikasi chat. Frame komunitas yang dipilih disalin ke
  desain sebagai PNG agar draft/link tetap utuh. Lihat `docs/SHARE_BACKEND.md`.
- **Draft**: payload v3 di `localStorage` (`selfie-booth:draft:v2`, key dipertahankan
  untuk migrasi). Empat slot disimpan lokal; slot tersembunyi tidak masuk share/export.
  Desain v1/v2 mempertahankan geometri portrait lama sampai layout dipilih ulang.
- **Kamera**: HTTPS + izin browser; satu Mulai untuk semua kotak kosong, atau sesi
  pengganti bila semua sudah terisi. Default 3 detik hitung mundur + 3 detik melihat
  hasil; jeda, ulangi langsung/per foto/semua, suara opsional, cermin, dan fullscreen.
  Hasil hanya diterapkan setelah Pakai semua. Frame di kamera hanya overlay pratinjau.
  Bila kamera terputus saat mengulang sesi yang sudah lengkap, pilih Lihat hasil
  yang ada lalu Pakai semua; hasil lama dan pengganti yang berhasil tetap tersedia.
- **Layout/export**: Landscape sampai 4 foto (2×2); Portrait sampai 3 foto vertikal;
  Photo Strip sampai 3 foto vertikal. PNG 1920×1080 / 1080×1920 / 640×1920.
  Preview, template, dan export memakai geometri bersama (`lib/layout.ts`).
- **Template custom**: panduan SVG beranotasi dan PNG transparan bersih, dengan ukuran
  dan metadata layout. Lihat `docs/TEMPLATES.md` sebelum membuat atau mengimpor frame.
- **Foto**: upload/kamera dikompres ke JPEG ≤1280px sebelum disimpan di state.

## Pemeriksaan lokal

Gunakan Node.js 22 atau lebih baru, sama dengan runtime API dan CI.

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Saat dev server aktif, gunakan `NEXT_DIST_DIR=.next-build npm run build` agar
build produksi tidak menimpa cache preview. `.hoplite/settings.json` menyimpan
perintah setup dan dev server. CI menjalankan tes, typecheck, dan build.

Verifikasi perangkat asli tetap diperlukan untuk izin webcam, pemilihan perangkat,
output suara, dan dukungan fullscreen masing-masing browser.

Tes browser otomatis: `npm run test:e2e` (install dependensi root dan `server/`
terlebih dahulu). Runner memakai API/SQLite sementara dan kamera simulasi;
lihat `e2e/README.md` untuk browser, port, cakupan, dan hasil tes.

## Keamanan dependensi

Audit ulang pada 14 Oktober 2026 mengonfirmasi 10 temuan frontend sebelum
pembaruan (1 critical, 7 high, 2 moderate). Next.js diperbarui ke **16.4.0**,
React/React DOM ke **19.3.0**, Tailwind ke **4.3.3**, dan PostCSS ke **8.5.30**.
Konfigurasi PostCSS, utilitas CSS, tipe React, dan parameter async halaman share
disesuaikan. Audit penuh frontend dan API kini melaporkan **0 temuan**;
CI menjalankan `npm audit --audit-level=moderate` untuk keduanya.

Angka audit hanya mencakup advisory yang diketahui saat pemeriksaan, bukan
jaminan bebas kerentanan. Jalankan ulang audit sebelum deployment. Perubahan
lokal belum diterapkan ke produksi; hasil audit repository tidak membuktikan
versi yang sedang berjalan di deployment.

Upgrade ini membutuhkan browser modern: Safari **16.4+**, Chrome/Edge **111+**,
dan Firefox **128+** (batas Tailwind 4). Perangkat dengan browser lebih lama
perlu diperbarui. Validasi kamera, izin, suara, Web Share, QR, dan preview
WhatsApp di perangkat asli masih diperlukan; lihat `e2e/FINDINGS.md`.
