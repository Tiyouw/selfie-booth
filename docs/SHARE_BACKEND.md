# Catatan: Backend share-link di VPS

Status sekarang: link share **tanpa backend** — seluruh desain (foto JPEG 720px,
frame, zoom/posisi) dikompres lz-string ke `#d=...` di URL. Kelebihan: nol server.
Kekurangan: link panjang (≈10–15 KB per foto), bisa terpotong di WhatsApp/SMS,
dan tidak bisa dibuka sebagai preview gambar (OG image).

Rencana: frontend tetap di Vercel, API kecil di VPS yang menyimpan desain dan
mengembalikan id pendek. Kode sudah disiapkan lewat abstraksi `ShareProvider` di
`lib/share.ts`, jadi cukup menambah provider baru — UI tidak perlu berubah.

## Kontrak API (usulan)

```
POST /v1/designs
  body: { v: 3, g, f, r, l, i?, k?, s: [[src, zoom, ox, oy], ...] }
  resp: { id: "k7Qx2a", url: "https://selfie.tiyoouw.app/s/k7Qx2a", expiresAt }

GET  /v1/designs/:id
  resp: payload yang sama (atau 404 kalau expired)

GET  /v1/designs/:id/image.png     ← opsional, render server-side untuk OG image
```

Gunakan payload sebelum kompresi `encodeState`: `g` jumlah foto, `r` rasio
(`16:9`, `9:16`, `1:3`), `l` versi layout, `i` inset custom dalam urutan
atas/kanan/bawah/kiri, dan `k` jumlah jendela frame custom. `s` hanya berisi
slot terlihat (maksimal empat); jangan mengirim foto tersembunyi dari draft.
Validasi dengan aturan `sanitizeState` dan pertahankan kompatibilitas v1/v2.

- id: 6–8 karakter base62 acak (bukan auto-increment, supaya tidak bisa ditebak).
- TTL: default 30 hari, hapus via cron.
- Batas ukuran body perlu dihitung untuk maksimal empat foto dan frame PNG custom
  (upload saat ini maksimal 10 MB, sebelum re-encode/base64). Tolak payload terlalu
  besar dengan pesan jelas; jangan menghapus frame/foto diam-diam.
- Rate limit per IP (mis. 20 POST/jam) + CORS hanya dari domain Vercel.
- Simpan foto sebagai file (bukan dalam DB) — SQLite untuk metadata sudah cukup.

## Perubahan di frontend

1. Tambah `remoteShareProvider` di `lib/share.ts`:
   - `createLink`: POST payload → `{ url }`, fallback ke `hashShareProvider` jika API down.
   - `resolve`: baca `/s/:id` (route Next.js `app/s/[id]/page.tsx`) atau `?s=id`, lalu GET.
2. `export const shareProvider = process.env.NEXT_PUBLIC_SHARE_API ? remoteShareProvider : hashShareProvider;`
3. Env di Vercel: `NEXT_PUBLIC_SHARE_API=https://api.tiyoouw.app`.
4. Route `app/s/[id]/` bisa men-set `generateMetadata` → OG image dari `/image.png` supaya
   preview di WhatsApp menampilkan hasil foto.

## Stack VPS yang disarankan

- Node (Hono/Fastify) atau Go — satu binary, mudah dijalankan via systemd.
- Caddy sebagai reverse proxy (HTTPS otomatis) → `api.tiyoouw.app`.
- Direktori data: `/var/lib/selfie-booth/{meta.sqlite, blobs/}`; backup rsync harian.

## Privasi

Foto orang tersimpan di server → tampilkan catatan singkat di modal share
("Link aktif 30 hari, bisa dihapus kapan saja") dan sediakan
`DELETE /v1/designs/:id` dengan token yang dikembalikan saat POST.
