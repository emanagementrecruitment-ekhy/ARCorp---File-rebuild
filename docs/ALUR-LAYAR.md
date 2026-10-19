# Alur layar

Navigasi: bilah bawah di ponsel (≤ 899 px), sidebar di layar lebar. Tombol Back Android berfungsi lewat riwayat peramban.

```
                    ┌────────────┐
                    │  Beranda   │  privasi • 3 langkah • folder terakhir
                    └─────┬──────┘
          [Pilih folder]  │
   Android: dialog penjelasan izin → pemilih folder sistem (SAF)
   Desktop: dialog folder sistem; folder sistem ditolak dengan pesan
                          ▼
                  Pindai (progres)  → Laporan SEBELUM (berkas, ukuran, akan dipindah/diganti nama,
                          │                           sudah rapi, folder baru, duplikat, ruang berpotensi hemat)
        ┌─────────────────┼───────────────────┬────────────────┐
        ▼                 ▼                   ▼                ▼
   Rapikan            Duplikat             Berkas           Aturan / Riwayat / Pengaturan
```

## Rapikan

1. **Pratinjau**: daftar `asal → tujuan`, label tindakan (pindah / ganti nama / keduanya), aturan yang cocok, penanda "nama bentrok, diberi nomor".
2. Cari, filter (aturan, tindakan), urut (asal, tujuan, ukuran, tanggal), centang/uncentang per berkas atau semua yang tampil.
3. **Jalankan N perubahan** → dialog konfirmasi: jumlah, "tidak ada berkas dihapus", "tidak ada yang ditimpa", "bisa dibatalkan".
4. Progres → **Laporan sesudah** (dipindah, diganti nama, dilewati, gagal) + **Batalkan perubahan ini**.

## Duplikat

1. **Mulai cari duplikat** (progres tiga tahap, bisa dibatalkan).
2. Kelompok duplikat: tiap berkas menampilkan **lokasi, ukuran, tanggal**; radio *Simpan* dan kotak *Tandai*.
3. Strategi salinan: Terbaik / Tertua / Terbaru / Jalur terpendek / Pilihan saya. Menandai semua salinan dalam satu kelompok ditolak.
4. Tujuan tanda: **Karantina** (default) atau Recycle Bin/Trash (hanya desktop).
5. **Pindahkan N ke karantina** → konfirmasi (berapa berkas, berapa ruang, ke mana, satu salinan tetap) → **Laporan sesudah** dengan catatan bahwa ruang baru bebas setelah karantina dikosongkan.

## Riwayat

- Daftar aktivitas (organisasi, duplikat, pembatalan, pengosongan karantina) dengan rincian per berkas dan **Batalkan**.
- **Karantina**: jumlah dan ukuran; **Kosongkan karantina…** memerlukan mengetik `HAPUS`, dan merupakan satu-satunya penghapusan permanen di aplikasi.

## Aturan

Penamaan (pola, huruf kecil/slug, pratinjau langsung) • aturan folder (aktif, nama, folder tujuan, ekstensi, kata kunci, urutan, hapus, contoh tujuan) • folder cadangan • salin/tempel JSON untuk memakai aturan sama di perangkat lain.

## Berkas · Pengaturan

Berkas: cari, filter kategori dan ukuran minimum, urut. Pengaturan: bahasa, abaikan tersembunyi dan folder proyek perangkat lunak, nama folder karantina, batasan platform perangkat ini, privasi, hapus riwayat.
