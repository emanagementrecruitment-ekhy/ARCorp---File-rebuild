# Berkas Rapi

Perapi file lokal untuk **Windows**, **macOS**, dan **Android**. Satu antarmuka, satu sistem aturan, satu inti logika.

Prinsip: **pratinjau dulu → konfirmasi dulu → bisa dibatalkan**. Tidak ada berkas yang dihapus atau ditimpa otomatis, dan tidak ada yang diunggah ke internet.

## Fitur

| Kebutuhan | Cara kerja |
|---|---|
| Pindai folder pilihan + pratinjau | Pindai hanya folder yang dipilih. Rencana dihitung di memori; disk tidak disentuh sebelum konfirmasi. |
| Kelompokkan jenis/tanggal/proyek/kustom | Aturan berurutan (jenis berkas, kata kunci, regex, ukuran) dengan pola folder seperti `Dokumen/{yyyy}`, `Foto/{yyyy}/Perjalanan`, `Video`, `Arsip`. |
| Duplikat dari **isi** | Ukuran → hash cepat (awal+akhir) → SHA-256 penuh. Menampilkan lokasi, ukuran, tanggal. |
| Tandai, jangan hapus otomatis | Duplikat hanya ditandai; pindah ke karantina setelah konfirmasi. |
| Salinan terbaik | Terbaik (nama bersih + sudah di folder tepat), tertua, terbaru, jalur terpendek, atau pilihan manual. |
| Penamaan otomatis | Pola yang bisa diedit, mis. `{yyyy}-{mm}-{dd}_{nama}`; idempoten (tidak menumpuk awalan). |
| Cari, filter, urut, riwayat | Layar Berkas dan Riwayat. |
| Batalkan / pulihkan | Setiap eksekusi tercatat dan bisa dibatalkan; karantina bisa dipulihkan; Recycle Bin/Trash (desktop) opsional. |
| Laporan sebelum/sesudah | Jumlah dipindah/diganti nama, duplikat, ruang berpotensi dihemat. |
| Bahasa Indonesia (+ English) | Seluruh UI. |

## Struktur

```
src/core/       Logika murni, sama di semua platform (aturan, penamaan, perencana, duplikat, riwayat)
src/platform/   Adapter sistem berkas: electron.ts, android.ts (Capacitor+SAF), memory.ts (demo browser)
src/ui/         Antarmuka bersama (satu desain, responsif ponsel→desktop)
electron/       Proses utama + preload + fs-service.cjs (akses berkas desktop)
android/        Proyek Capacitor; plugin SAF: android/app/src/main/java/id/berkasrapi/app/SafFilesPlugin.java
tests/          Unit, berkas sungguhan, dan UI end-to-end
docs/           Arsitektur, alur layar, build, batasan platform
```

## Mulai cepat

```bash
npm install            # Node >= 22.12
npm test               # 37 tes: logika, berkas sungguhan, UI end-to-end
npm run dev            # UI di browser (mode demo, berkas virtual)
npm run desktop        # aplikasi desktop (Electron)
npm run android:apk    # APK debug (butuh Android SDK; lihat docs/BUILD.md)
```

## Status verifikasi (jujur)

Diverifikasi di lingkungan pengembangan Linux tanpa akses ke Android SDK dan binary Electron:

- ✅ Inti logika dan layanan berkas desktop diuji pada folder sungguhan (pindah, tidak menimpa, tolak keluar-root/symlink, karantina, batalkan, tolak folder sistem).
- ✅ UI diuji end-to-end di Chromium terhadap layanan berkas yang sama, di ukuran ponsel dan desktop.
- ✅ Plugin Android (Java) **dikompilasi** terhadap framework Android 16 asli, dengan stub untuk API Capacitor/AndroidX.
- ⚠️ **APK belum dibangun.** Repositori Maven Google dan unduhan Android SDK diblokir di lingkungan ini. APK harus dibangun di mesin Anda atau lewat CI (`docs/BUILD.md`).
- ⚠️ Plugin SAF **belum dijalankan** di perangkat/emulator. Perilaku nyata penyedia dokumen (move vs salin, tanggal modifikasi) perlu diuji di perangkat.
- ⚠️ Aplikasi Electron belum diluncurkan sebagai proses Electron, hanya logikanya (`fs-service`, jembatan IPC lewat uji) dan sintaks `main`/`preload`. Installer Windows/macOS belum dibangun.
- ⚠️ Versi GitHub Actions di `.github/workflows/build.yml` belum diverifikasi sebagai terbaru.

Lisensi: MIT.
