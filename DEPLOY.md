# Selfie Booth — Deploy Guide

Website photobooth sudah selesai. Project: `/workspace/selfie-booth/`

## Struktur

```
selfie-booth/
├── app/            # Next.js App Router
│   ├── layout.tsx  # font Poppins + metadata
│   ├── page.tsx    # halaman utama + semua kontrol
│   └── globals.css # styling dark theme ala himasif.id
├── components/     # PhotoSlotView, icons
├── lib/            # types, state (encode/decode), render (canvas), image
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

- **Share link**: desain di-encode ke URL hash (lz-string). Tanpa database/backend.
  Foto asli tersimpan di URL, jadi URL bisa panjang (normal untuk use case event).
- **Kamera**: butuh HTTPS (Vercel otomatis) + izin browser.
- **Download**: render canvas 3× (1080×1920 untuk 9:16, 1920×1080 untuk 16:9).
