# Fase 4 — Galeri acara (kode acara, galeri live, slideshow)

Alur dslrbooth yang paling dicari di acara: semua strip masuk satu galeri,
tamu memindai QR galeri, dan layar proyektor menayangkan hasil secara live.
Murni tambahan di atas API fase 2 — tidak mengubah kontrak yang ada.

## API (tambahan)

```
POST   /v1/events                    {name} → {code, adminToken}   (rate limit 5/jam/IP)
GET    /v1/events/:code              → {name, items: [{id, createdAt, hasGif}]} (urut terbaru)
DELETE /v1/events/:code/designs/:id  header X-Admin-Token → 204 (moderasi host)
```

- `POST /v1/designs` menerima field multipart opsional `eventCode` — design
  bergabung ke galeri saat dibuat (kode tidak dikenal → `400`).
- Kode acara: 6 karakter base62 tanpa karakter ambigu (0/O, 1/l/I).
- Skema: tabel `events(id, code UNIQUE, name, admin_token, created_at,
  expires_at)` + kolom `event_id` nullable di `designs`. TTL galeri
  mengikuti TTL design (30 hari).

## Frontend

- `app/e/[code]/page.tsx`: galeri masonry thumbnail (per item memakai
  `/og.png`, `loading="lazy"`), polling tiap 10 detik (SSE menyusul belakangan
  bila perlu), tombol **Slideshow** (fullscreen, foto berganti tiap 5 detik,
  untuk projector), tiap item membuka viewer `/s/:id` (unduh, edit).
- Booth kiosk: host memasukkan kode acara sekali (disimpan di localStorage,
  key terpisah dari draft); tiap share otomatis membawa `eventCode`. QR
  ShareModal bisa diarahkan ke `/e/:code` atau `/s/:id`.
- Moderasi: halaman `/e/[code]/admin` dengan `adminToken` host (disimpan di
  sessionStorage) untuk menghapus item.

## Privasi & catatan

- Galeri publik lewat kode — tampilkan peringatan saat membuat acara:
  "Siapa pun yang tahu kode bisa melihat semua strip". Kode acak 6 karakter
  menyulitkan tebakan, tapi bukan kontrol akses sungguhan; host memegang
  tanggung jawab berbagi kode.
- `adminToken` tidak pernah dikirim ke galeri publik — hanya halaman admin.
- Rate limit GET galeri longgar tapi ada (mis. 60/menit/IP): polling 10
  detik dari 50 perangkat tetap aman.

## Tes & verifikasi

- Server: kode ambigu terfilter, `eventCode` invalid → 400, admin token
  salah → 403, item terhapus tidak muncul di listing, TTL galeri.
- Manual: dua perangkat live-update < 15 s; slideshow di projector; 50 item
  termuat mulus; hapus item dari admin langsung hilang dari galeri tamu.
