# Roadmap: GIF & Share Backend

Rencana bertahap untuk GIF dan share backend. Setiap fase bisa di-ship sendiri
dan tetap berguna tanpa fase berikutnya; tidak ada fase yang memutus fitur lama.

| Fase | Judul | Deliverable | Backend | Detail |
|---|---|---|---|---|
| 1 | GIF strip animasi | Buat + unduh GIF strip di browser (gifenc) | ❌ | [GIF_STRIP.md](GIF_STRIP.md) |
| 2 | Share backend VPS | Link pendek `/s/:id`, viewer, OG image, QR code | ✅ | [SHARE_BACKEND.md](SHARE_BACKEND.md) |
| 3 | Boomerang per foto | Burst capture saat sesi kamera → GIF boomerang | ✅ (upload GIF) | [BOOMERANG.md](BOOMERANG.md) |
| 4 | Galeri acara | Kode acara + galeri live + slideshow | ✅ | [EVENT_GALLERY.md](EVENT_GALLERY.md) |

## Urutan & alasan

1. **Fase 1** tidak menyentuh jaringan maupun model state — risiko terkecil,
   efek langsung terlihat, dan GIF-nya dipakai ulang oleh fase 2/3.
2. **Fase 2** mengganti pain point terbesar (link hash ratusan KB yang
   terpotong di chat) dan membuka QR + OG preview.
3. **Fase 3** menambah penyimpanan frame di memori sesi kamera + upload GIF.
4. **Fase 4** murni tambahan di atas API fase 2 (tabel + route baru), tidak
   mengubah kontrak yang sudah ada.

## Satu repo, dua target deploy

```
selfie-booth/                        # repo ini
├── app/  components/  lib/  public/ # FE Next.js → Vercel (tidak berubah)
├── server/                          # API → VPS (mulai fase 2)
│   ├── src/                         # Hono + SQLite + @napi-rs/canvas
│   ├── deploy/                      # unit systemd + Caddyfile contoh
│   └── package.json                 # dependensi terpisah dari root
├── docs/                            # dokumen desain per fase
└── tests/                           # tes core FE; server punya tes sendiri
```

- Root `package.json` tetap milik FE — Vercel membangun Next.js seperti biasa
  dan mengabaikan `server/`.
- VPS melakukan `git pull` pada repo yang sama lalu menjalankan `server/`.
- Modul murni di `lib/` (geometri layout, validasi state) dipakai oleh kedua
  sisi — satu sumber kebenaran, tanpa duplikasi rumus.

## Gerbang tiap fase

- **F1**: GIF 4 foto di-encode ≤ 3 s di ponsel menengah; timeline lolos
  `tests/core-gif.cjs`; unduh & Web Share GIF terverifikasi di Android + iOS.
- **F2**: link pendek dibuka di perangkat lain; preview OG tampil di WhatsApp;
  QR ter-scan; delete token menghapus design; 413/429 tertangani UI.
- **F3**: boomerang 8 frame mulus di review; reload halaman tidak meninggalkan
  burst di localStorage (privasi); retake membuang frame lama.
- **F4**: galeri 20 strip termuat < 2 s; slideshow jalan di projector; host
  bisa menghapus item; kode acara tidak mudah ditebak.
