# Selfie Booth — Deploy Guide

Website photobooth sudah selesai. Project: `/workspace/selfie-booth/`

## Struktur

```
selfie-booth/
├── app/            # Next.js App Router
│   ├── layout.tsx  # font Poppins + metadata
│   ├── page.tsx    # halaman utama + semua kontrol
│   └── globals.css # styling dark theme ala himasif.id
├── components/     # PhotoSlotView, CameraModal, ShareModal, icons, useToast
├── lib/            # types, layout (geometri bersama), state, share, render, image, frames
├── public/frames/  # frame built-in (SVG)
├── scripts/        # gen-frames.py (regenerate frame default)
├── docs/           # SHARE_BACKEND.md (rencana backend VPS)
├── vercel.json     # config deploy Vercel
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

### Opsi C — Deploy dengan Token (biar aku kerjakan dari sini)

Kalau mau aku yang deploy, kasih Vercel token:
1. Buka https://vercel.com/account/tokens → Create Token
2. Tempel token-nya ke aku (atau set `VERCEL_TOKEN` di environment)

## DNS — selfie.tiyoouw.app

**Arahkan langsung ke Vercel (bypass VPS/Traefik, paling hemat):**

Di provider DNS tempat `tiyoouw.app` dikelola (Cloudflare?):

| Type | Name/Host | Value |
|---|---|---|
| `CNAME` | `selfie` | `cname.vercel-dns.com` |

> Setelah deploy, Vercel akan kasih URL production (misal `selfie-booth-xxx.vercel.app`).
> Di Vercel dashboard: **Project → Settings → Domains → Add** `selfie.tiyoouw.app`,
> lalu ikuti instruksi (Vercel akan validasi CNAME di atas).

Kalau DNS `*.tiyoouw.app` ternyata di-point ke IP VPS (43.157.226.23), maka untuk
subdomain `selfie` kamu perlu **override dengan CNAME ke Vercel** (atau hapus wildcard
untuk subdomain ini). CNAME spesifik selalu menang atas wildcard.

## Catatan Teknis

- **Frame built-in**: SVG di `public/frames/`, terdaftar di `lib/frames.ts`
  (`inset` = area transparan tempat foto diletakkan). Tambah frame baru: taruh
  PNG/SVG 1920×1080 atau 1080×1920, lalu tambahkan entri di `BUILTIN_FRAMES`.
  Frame default bisa di-regenerate dengan `python3 scripts/gen-frames.py`.
- **Share link**: desain di-encode ke URL hash (`#d=…`, lz-string). Foto dikecilkan
  ke 720px agar link tetap ≈10–15 KB per foto; modal share memberi peringatan bila
  link terlalu panjang. Rencana backend VPS + id pendek: lihat `docs/SHARE_BACKEND.md`.
- **Draft**: tersimpan otomatis di `localStorage` (`selfie-booth:draft:v2`).
- **Kamera**: butuh HTTPS (Vercel otomatis) + izin browser. Ada countdown 3s/5s,
  mirror, ganti kamera, dan preview sebelum dipakai.
- **Export**: PNG 1920×1080 (16:9) / 1080×1920 (9:16). Preview dan export memakai
  perhitungan layout yang sama (`lib/layout.ts`) sehingga hasil identik.
- **Foto**: upload/kamera dikompres ke JPEG ≤1280px sebelum disimpan di state.
