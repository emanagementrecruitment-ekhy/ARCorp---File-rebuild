# Arsitektur

## Tujuan desain

1. **Satu aturan, satu perilaku.** Logika perapian ada di satu tempat (`src/core`) dan dipakai identik di Windows, macOS, dan Android.
2. **Aman secara struktur, bukan hanya secara niat.** Pelindung ada di lapisan terendah (layanan berkas), jadi UI yang salah pun tidak bisa menimpa atau keluar dari folder pilihan.
3. **Lokal.** Tidak ada kode jaringan, tidak ada izin INTERNET di Android, dan CSP `connect-src 'self'`.

## Lapisan

```
┌──────────────────────────────────────────────────────────────┐
│ UI bersama (TypeScript, tanpa framework)   src/ui, src/i18n  │  satu desain, id/en
├──────────────────────────────────────────────────────────────┤
│ Inti logika murni (tanpa I/O)              src/core          │  aturan • penamaan • perencana
│                                                              │  duplikat • pemilih salinan • riwayat
├──────────────────────────────────────────────────────────────┤
│ PlatformAdapter (antarmuka)                src/platform      │  pickFolder • scan • hash • apply
├───────────────────┬──────────────────────┬───────────────────┤
│ Electron          │ Capacitor + SAF      │ Memori (demo)     │
│ preload ⇄ main    │ SafFilesPlugin.java  │ browser biasa     │
│ fs-service.cjs    │ DocumentsContract    │                   │
│ Windows • macOS   │ Android              │                   │
└───────────────────┴──────────────────────┴───────────────────┘
```

Semua jalur yang melintasi adapter **relatif terhadap folder pilihan** (`Dokumen/2026/a.pdf`). Ini menyatukan desktop (jalur absolut) dan Android (URI dokumen) di balik satu bentuk jalur, dan membuat "tetap di dalam folder pilihan" bisa dipaksakan di satu tempat.

## Pilihan teknologi

| Keputusan | Dipilih | Alasan | Alternatif |
|---|---|---|---|
| Desktop | **Electron** | Kode JS/TS yang sama dengan UI; `shell.trashItem` memberi Recycle Bin/Trash asli; Node `fs`/`crypto` cukup untuk hash; build Windows/macOS mapan. | Tauri (lebih kecil, tapi butuh Rust dan plugin Trash/FS tersendiri); .NET MAUI (bukan satu UI dengan Android WebView). |
| Android | **Capacitor + plugin Java SAF** | UI web yang sama berjalan di WebView; akses berkas lewat SAF adalah jalur resmi tanpa izin penyimpanan luas. | Native Compose penuh (UI kedua yang harus dijaga sinkron); `MANAGE_EXTERNAL_STORAGE` (ditolak Play Store untuk kasus ini, dan terlalu luas). |
| UI | TypeScript + DOM langsung + Vite | ±85 kB (27 kB gzip) termasuk CSS, tanpa dependensi runtime. Dibangun sebagai skrip klasik agar aman dimuat dari `file://`. | React/Preact (tidak diperlukan di skala ini). |
| Pengujian | Vitest + Playwright-core | Uji berkas sungguhan dan UI sungguhan dengan alat yang sama. | |

Dependensi runtime: **nol** (Capacitor dibundel Vite). Audit produksi: 0 kerentanan.

## Invarian keselamatan dan di mana ditegakkan

| Invarian | Ditegakkan di | Diuji |
|---|---|---|
| Pratinjau tidak menyentuh disk | `buildPlan` murni; adapter hanya dipanggil dari `apply` | e2e: pohon berkas identik sebelum konfirmasi |
| Konfirmasi sebelum pindah/ganti nama/hapus | `actions.ts` → `confirmModal` | e2e |
| Tidak pernah menimpa | Perencana (akhiran `(2)`) **dan** adapter (`skipped: exists`) | unit + berkas sungguhan |
| Tetap di folder pilihan | `rel2abs` menolak `..`/kosong/`\0`; cek `realpath` induk (symlink); SAF hanya menelusuri anak dari tree URI | berkas sungguhan |
| Folder sistem ditolak | `protectedReason` (akar drive, `C:\Windows`, `/usr`, `/System`, folder rumah) | berkas sungguhan |
| Renderer hanya bisa memakai folder yang pernah dipilih lewat dialog | `allowed-roots.json` di proses utama | tinjauan kode |
| Hapus permanen hanya isi karantina | op `discard` ditolak di luar folder karantina (desktop & Android) | berkas sungguhan |
| Duplikat tidak dihapus otomatis | Default: op `quarantine` (pindah). Satu salinan per kelompok tidak bisa ditandai semua. | unit + e2e |
| Bisa dibatalkan | Setiap eksekusi → `HistoryEntry`; `undoOperations` membalik urutan | unit + e2e |
| Tanpa jaringan | Tidak ada kode jaringan; CSP; Electron memblokir permintaan non-lokal; manifest tanpa izin | grep + inspeksi |

## Algoritma

**Perencana** (`planner.ts`): untuk tiap berkas, cari aturan aktif pertama yang cocok → render folder dari pola (`{kategori} {yyyy} {mm} {dd} {ext} {proyek} {induk}`) → render nama (`{nama} {nama_asli} {yyyy} {mm} {dd}`) → bila jalur akhir sudah dipakai berkas lain, beri `(2)`, `(3)`… Hasil sama dengan posisi sekarang = "sudah rapi" (idempoten: menjalankan dua kali tidak mengubah apa pun). `{nama}` membuang awalan tanggal ISO lama agar tidak menumpuk. Segmen nama dibersihkan untuk semua OS (karakter terlarang, nama cadangan Windows, titik/spasi akhir, panjang).

**Duplikat** (`duplicates.ts`): kelompokkan menurut ukuran (berkas 0 byte diabaikan) → hash cepat (64 KiB awal + 64 KiB akhir + ukuran) untuk menyaring → SHA-256 penuh untuk kandidat. Hanya hash penuh yang sama yang dianggap duplikat, jadi hash cepat tidak pernah menyebabkan salah deteksi. Dibatalkan lewat tombol Batal.

**Salinan terbaik** (`keeper.ts`): pada duplikat persis, ukuran dan isi *pasti sama*, sehingga "kualitas" dinilai dari jalur dan nama: penalti untuk `(1)`, `Copy`, `salinan`, `final2`; bonus bila sudah berada di folder yang akan dituju aturan; penalti kecil untuk folder Download dan jalur dalam; seri diputus tanggal tertua. Pilihan manual selalu tersedia. Pembandingan kualitas gambar/video (resolusi, bitrate) bukan bagian dari duplikat persis.

**Eksekusi** (`run.ts`): operasi dijalankan berurutan; yang terlewat karena `exists` (mis. tukar nama berantai) dicoba sekali lagi.

## Penyimpanan data

`localStorage` (pengaturan, riwayat ≤200 entri, folder terakhir) di dalam profil aplikasi. Tidak ada basis data, tidak ada sinkronisasi cloud. Aturan dipindah antarperangkat lewat salin-tempel JSON (menu Aturan).

## Titik perluasan

- Platform baru (iOS, Linux): implementasikan `PlatformAdapter`.
- Sumber tanggal EXIF untuk foto: tambahkan pembaca EXIF di adapter dan isi `mtime`/`takenAt` di `FileEntry`.
- Kemiripan gambar (perceptual hash): tambahkan tahap di `findDuplicates` setelah hash penuh.
