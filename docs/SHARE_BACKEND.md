# Fase 2 — Share backend VPS (id pendek, viewer, OG, QR)

> **Status implementasi:** sudah live di `https://api.tiyoouw.app` (deploy
> 2026-09-11 oleh agent VPS: Traefik/Coolify sebagai reverse proxy, timer TTL
> + backup harian aktif). Yang tersisa di sisi FE: set env Vercel
> `NEXT_PUBLIC_SHARE_API` + `SHARE_API`. Fase 1 (GIF strip) sudah berjalan di
> klien.

Status: link share **tanpa backend** — seluruh desain dikompres lz-string ke
`#d=…` (≈10–15 KB per foto). Link panjang bisa terpotong di WhatsApp/SMS dan
tidak bisa jadi preview gambar. Fase ini menambah API kecil di VPS: simpan
desain → id pendek → link yang bisa dibuka siapa saja, dengan OG image dan QR
code. Frontend tetap di Vercel; semuanya dalam satu repo — lihat
[ROADMAP.md](ROADMAP.md).

## Arsitektur

```
Vercel (selfie.tiyoouw.app)           VPS (api.tiyoouw.app)
├── Next.js app (tidak berubah)       ├── server/ (Hono, Node 20)
├── app/s/[id]/page.tsx ──GET───────► │   POST   /v1/designs
│    viewer + OG metadata             │   GET    /v1/designs/:id
├── lib/share.ts                      │   GET    /v1/designs/:id/og.png
│    remoteShareProvider ──POST─────► │   GET    /v1/media/:id.gif
└── ShareModal: link pendek + QR      │   DELETE /v1/designs/:id
                                      └── SQLite + blobs di /var/lib/selfie-booth
```

- FE → API hanya perlu CORS untuk POST/DELETE; halaman viewer melakukan GET
  secara server-side dari server Next.js (tidak kena CORS).
- Modul murni `lib/` dipakai ulang oleh server: `lib/state.ts`
  (`sanitizeState` — validasi identik klien/server, tetap menerima payload
  v1/v2) dan `lib/layout.ts` (geometri). `lib/render.ts` memakai
  `document`/`Image`, jadi server punya `server/src/render.ts` sendiri dengan
  `@napi-rs/canvas` dan geometri yang sama. Tambahkan `lz-string` ke
  dependensi server karena `lib/state.ts` mengimpornya.

## Kontrak API v1

### POST /v1/designs — simpan desain (multipart/form-data)

| Field | Jenis | Aturan |
|---|---|---|
| `design` | string JSON | payload v3 **sebelum** kompresi `encodeState`: `{v, g, f, r, l, i?, k?, s}`; `s` hanya slot terlihat (maks 4) — jangan sertakan slot tersembunyi dari draft |
| `gif` | file | opsional, `image/gif` ≤ 8 MB (GIF fase 1 / boomerang fase 3) |

Resp `201`:

```json
{
  "id": "k7Qx2a9L",
  "url": "https://selfie.tiyoouw.app/s/k7Qx2a9L",
  "gifUrl": "https://api.tiyoouw.app/v1/media/k7Qx2a9L.gif",
  "expiresAt": 1798761600,
  "deleteToken": "f47ac10b58cc4372a05c0a3f"
}
```

Error: `400` payload gagal `sanitizeState`, `413` body > 16 MB atau
`design` > 12 MB, `429` rate limit. Format error selalu
`{ error: kode, message: teks }`. Jangan pernah menghapus foto/frame
diam-diam — tolak dengan pesan jelas.

### Endpoint lain

```
GET    /v1/designs/:id          → payload JSON (identik yang dikirim, plus gifUrl bila ada GIF) | 404 | 410 expired
GET    /v1/designs/:id/og.png   → PNG strip, sisi panjang 1080 (OG/WhatsApp)
GET    /v1/media/:id.gif        → blob GIF (X-Content-Type-Options: nosniff)
DELETE /v1/designs/:id          → 204; token di header X-Delete-Token
                                  (bukan query string — token tidak boleh masuk log akses)
GET    /v1/frames?ratio=1:3     → koleksi frame komunitas: {frames:[{id,name,ratio,grid,inset,createdAt,imageUrl}]}; filter rasio opsional (16:9/9:16/1:3)
GET    /v1/frames/:id/image     → PNG frame (ACAO: *, Cache-Control immutable — aman untuk canvas lintas origin)
POST   /v1/frames               → tambah frame komunitas; multipart name + code + png; butuh env FRAME_UPLOAD_CODE
DELETE /v1/frames/:id           → 204; kode akses di header X-Frame-Code
GET    /v1/health               → {ok: true} (monitoring)
```

### Frame komunitas

- **Koleksi bersama**: frame PNG transparan yang terlihat oleh semua pengunjung
  semua domain booth (docs/TEMPLATES.md). Tersimpan permanen di SQLite
  (tabel `frames`, kolom BLOB `png`) — tidak ikut TTL 30 hari.
- **Akses kode**: POST dan DELETE butuh kode di env `FRAME_UPLOAD_CODE` (sha256 +
  `timingSafeEqual`, sama seperti delete token). Kosong/absen = koleksi dinon-
  aktifkan (POST → `403 disabled`). Bagikan kode ini hanya ke pengelola booth
  (mis. pengurus himasif); tidak diperlukan untuk memilih frame.
- **Validasi server**: PNG di-decode dengan `@napi-rs/canvas`; ukuran harus
  persis 1920×1080 / 1080×1920 / 640×1920; jendela transparan diukur server
  dengan `detectTransparentWindows` (`lib/frameGeom`) — 1–4 jendela (portrait
  maks 3); `grid` dan `inset` disimpan dari hasil ukur, bukan dari klaim klien.
- **Batas**: `MAX_FRAME_MB` (default 5) per PNG, rate limit upload terpisah
  20/jam/IP. `Cache-Control immutable` karena id baru untuk setiap upload;
  gambar dikirim dengan `Access-Control-Allow-Origin: *` (aset publik) agar
  cache tidak meracuni render canvas CORS di frontend.

### Aturan

- **id**: 8 karakter base62 dari `crypto` random (62⁸ ≈ 2×10¹⁴ kombinasi),
  cek keunikan di DB, retry saat tabrakan. Bukan auto-increment — tidak bisa
  di-enumerate.
- **TTL**: default 30 hari (`TTL_DAYS`). Penghapusan lewat timer systemd
  harian: hapus baris + file blob.
- **deleteToken**: 32 hex acak, dikembalikan sekali saat POST, disimpan
  sebagai SHA-256. DELETE dengan token salah → `403`.
- **Validasi**: `JSON.parse` → `sanitizeState` saat POST; simpan string
  aslinya; validasi ulang saat GET (pertahanan kedua).
- **Rate limit**: 20 POST/jam per IP (sliding window di memori — cukup untuk
  satu instance).
- **CORS**: hanya origin di env `ALLOWED_ORIGINS` (default
  `https://selfie.tiyoouw.app`; beberapa domain dipisah koma), hanya di
  POST/DELETE. GET publik: `Cache-Control: public, max-age=300` (og.png:
  3600). Booth multi-domain: link pendek otomatis memakai domain booth asal
  yang terdaftar di allowlist (fallback `FRONTEND_ORIGIN`) — satu API bisa
  melayani beberapa domain sekaligus.
- GET terbuka oleh siapa pun yang punya link — memang begitu desainnya
  (privasi di bawah).

## Skema & penyimpanan

```sql
CREATE TABLE IF NOT EXISTS designs (
  id           TEXT PRIMARY KEY,
  payload      TEXT NOT NULL,           -- JSON asli dari klien
  has_gif      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,        -- unix detik
  expires_at   INTEGER NOT NULL,
  delete_token TEXT NOT NULL            -- sha256 hex
);
CREATE INDEX IF NOT EXISTS idx_designs_expires ON designs(expires_at);
```

- File di `/var/lib/selfie-booth/`: `meta.sqlite` + `blobs/<id>.gif`. Blob
  sebagai file (bukan BLOB SQLite) agar backup rsync cepat.
- Backup harian: rsync direktori data + `sqlite3 meta.sqlite ".backup ..."`
  ke lokasi kedua; lakukan latihan restore sekali sebelum produksi.

## Render OG (server)

`server/src/render.ts` dengan `@napi-rs/canvas` (binary prebuilt, tanpa
dependensi sistem): latar `#0d0d0d` → sel termasuk slot kosong `#161616` dan
sudut bulat → foto via `placePhoto` → frame overlay — meniru `lib/render.ts`
pada kanvas sisi panjang 1080. Payload memuat foto 720 px (lihat
`shareableState` di `lib/share.ts`) — cukup untuk OG.

## Perubahan frontend

1. `lib/state.ts`: ekstrak `buildPayload(state)` — objek sebelum kompresi;
   `encodeState` tinggal membungkusnya (regresi: hasil tetap identik).
2. `lib/share.ts`: `remoteShareProvider`:
   - `createLink`: `shareableState` → `buildPayload` → POST →
     `{ url, length: url.length, size: 'small', expiresAt, deleteToken }`.
     Bila API gagal/error 5xx → **fallback `hashShareProvider`** + toast
     "Server share tidak tersedia — memakai link panjang".
   - `resolve`: tidak dipakai di halaman utama; viewer route yang memuat.
   - `export const shareProvider = NEXT_PUBLIC_SHARE_API ? remote : hash`.
3. `app/s/[id]/page.tsx` (viewer, mobile-first): strip (PNG `/og.png` atau
   render klien), tombol unduh PNG, unduh GIF bila ada, tombol WhatsApp
   (`https://wa.me/?text=<url>`), dan **"Buka di editor"** → `/` dengan
   `#d=` payload ter-`encodeState` (alur hash yang sudah ada — tamu lanjut
   mengedit). `generateMetadata` memakai `/og.png` sebagai og:image.
4. `components/ShareModal.tsx`: link pendek + masa aktif + catatan "Link
   aktif 30 hari, bisa dihapus kapan saja"; **QR code** (paket `qrcode`,
   render ke canvas) untuk discan tamu; tombol "Hapus dari server" (DELETE
   dengan token). Token hanya di memori halaman — refresh berarti kehilangan
   token; sisanya mengandalkan TTL. Itu kompromi yang disengaja.
5. Env Vercel: `NEXT_PUBLIC_SHARE_API=https://api.tiyoouw.app`.

## Deploy VPS

```bash
# sekali
sudo mkdir -p /var/lib/selfie-booth/blobs && sudo chown $USER /var/lib/selfie-booth
git clone <repo> && cd selfie-booth/server && npm ci && npm run build
sudo cp deploy/selfie-booth-api.service /etc/systemd/system/
sudo systemctl enable --now selfie-booth-api

# Caddyfile
api.tiyoouw.app {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8787
}
```

Kalau port 80/443 VPS sudah dipegang reverse proxy lain (mis. Traefik dari
Coolify), jangan pasang Caddy — cukup arahkan host `api.tiyoouw.app` ke
`127.0.0.1:8787` (atau `172.17.0.1:8787` dari dalam Docker) lewat dynamic
config proxy tersebut; hasil akhirnya sama (begitulah deploy produksi saat ini).

- `EnvironmentFile=/etc/selfie-booth/api.env`: `PORT=8787`,
  `DATA_DIR=/var/lib/selfie-booth`,
  `ALLOWED_ORIGINS=https://selfie.tiyoouw.app`, `TTL_DAYS=30`.
- Timer `selfie-booth-expire.timer` harian menjalankan `node dist/expire.js`.
- Update: `git pull && npm ci && npm run build && sudo systemctl restart selfie-booth-api`.
- DNS: `api` → A record ke VPS. HTTPS otomatis oleh Caddy.
- Log: `journalctl -u selfie-booth-api -f`. Jangan log body/URL lengkap.
- Catatan keamanan terpisah: audit dependensi FE masih melaporkan temuan
  critical di Next.js 14.2.15 (lihat DEPLOY.md) — tangani sebelum produksi.

## Privasi

- Server menyimpan foto orang — nyatakan di UI (teks ShareModal di atas).
- Tanpa akun, tanpa analitik; log minimal; TTL pendek; delete token memberi
  kontrol; rate limit + batas ukuran mencegah penyalahgunaan penyimpanan.
- Jangan simpan IP di DB; rate limit hanya di memori (hilang saat restart —
  bisa diterima).

## Tes

- `server/` (`npm test`: build + `node --test`, client request via
  `app.request()` Hono tanpa dependensi test tambahan): validasi payload
  (lewat `sanitizeState`), 400/413/429, delete token benar/salah, TTL → 410,
  og.png 200 + content-type, expire cleanup menghapus blob. Fixture foto:
  `scripts/gen-test-photos.mjs`.
- FE: tes unit fallback provider (mock fetch gagal), `buildPayload`
  menghasilkan string identik dengan `encodeState` lama (regresi).
- Manual (butuh deploy): link dibuka di perangkat lain, preview OG di
  WhatsApp, QR discan iPhone/Android, DELETE menghapus lalu GET → 404.
