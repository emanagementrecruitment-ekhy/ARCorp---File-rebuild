# Batasan akses berkas per platform

## Ringkasan

| | Windows | macOS | Android |
|---|---|---|---|
| Cara akses | Dialog folder sistem; jalur absolut dikunci di proses utama | Sama | **Storage Access Framework** (pemilih folder sistem) |
| Izin yang diminta | Tidak ada | Mungkin diminta macOS untuk Desktop/Dokumen/Download | **Tidak ada izin manifest**; izin per-folder lewat pemilih |
| Cakupan | Hanya folder pilihan dan isinya | Sama | Hanya pohon folder yang dipilih |
| Ditolak | Akar drive, `C:\Windows`, `Program Files`, `ProgramData`, folder rumah itu sendiri | Akar, `/System`, `/Library`, `/Applications`, `/usr`, folder rumah itu sendiri | Akar penyimpanan, `Download` (akarnya), `Android/data`, `Android/obb` (**oleh sistem**, Android 11+) |
| Recycle Bin/Trash | Ya (opsional, tidak bisa dipulihkan dari aplikasi) | Ya (Trash) | **Tidak ada** untuk SAF → karantina di dalam folder pilihan |
| Karantina | `_Karantina/<tanggal>/…` dalam folder pilihan | Sama | Sama |
| Pindah antarfolder | `rename`; `copy+verifikasi+hapus` bila beda volume | Sama | `moveDocument` bila didukung; selain itu salin+verifikasi+hapus |

## Windows
- Berkas yang sedang dikunci aplikasi lain akan gagal dipindah; dicatat sebagai *gagal* dan tidak menghentikan sisanya.
- Atribut "Hidden" Windows tidak dibaca; hanya nama berawalan titik, `Thumbs.db`, dan `desktop.ini` yang diabaikan.
- Folder yang disinkronkan OneDrive/Dropbox dengan berkas "hanya online": menghitung hash dapat memicu unduhan berkas itu. Hindari mencari duplikat di folder seperti itu atau pastikan berkas tersedia offline.
- Jalur sangat panjang (>260 karakter) dapat gagal pada konfigurasi Windows lama.
- Installer tanpa sertifikat memicu SmartScreen.

## macOS
- Pada pemakaian pertama di Desktop, Dokumen, atau Download, macOS dapat menampilkan dialog izin (TCC).
- Paket `.app`, `.photoslibrary`, `.lrlibrary`, `.fcpbundle`, `.xcodeproj`, `.framework` diperlakukan sebagai satu kesatuan dan **dilewati**.
- Tanpa notarisasi, Gatekeeper memblokir pembukaan pertama (lihat BUILD.md).

## Android
- **SAF tidak bisa melihat di luar folder yang dipilih**, dan tidak bisa memilih akar penyimpanan, akar `Download`, `Android/data`, atau `Android/obb` pada Android 11+. Pilih subfolder (mis. `Download/Belum Dirapikan`, `Documents`, `Pictures`, `DCIM/Camera`).
- Izin folder bersifat persisten; Android membatasi jumlah izin persisten per aplikasi (128 pada versi lama, 512 pada Android 11+). Folder terakhir yang tak terpakai bisa dilepas lewat Pengaturan Android.
- Kinerja: SAF jauh lebih lambat daripada akses jalur langsung. Pemindaian puluhan ribu berkas dapat memakan menit. Hash cepat sengaja membaca hanya awal dan akhir berkas besar.
- **Tanggal modifikasi:** `moveDocument`/`renameDocument` mempertahankan tanggal. Jalur cadangan *salin+hapus* (penyedia tanpa dukungan move, atau Android 7.x) **tidak** bisa menyetel ulang tanggal modifikasi lewat SAF, sehingga tanggal berkas hasil salinan menjadi waktu penyalinan. Karena folder/nama berbasis tanggal memakai tanggal modifikasi, perapian berikutnya dapat memutuskan folder tahun yang berbeda untuk berkas tersebut. Penyedia penyimpanan internal bawaan Android umumnya mendukung move pada versi modern, tetapi ini perlu dikonfirmasi di perangkat Anda.
- Penyedia cloud (Drive, dsb.) bisa mengekspos "dokumen virtual" (mis. Google Docs). Itu **dilewati** pemindaian.
- Tidak ada Recycle Bin: pemulihan dari karantina dilakukan di aplikasi (Riwayat → Batalkan).
- Aplikasi tidak memiliki izin INTERNET. Jika Anda menambahkannya kembali (mis. untuk fitur lain), klaim privasi harus ditinjau ulang.

## Semua platform
- **Tanggal berasal dari tanggal modifikasi berkas**, bukan EXIF. Foto yang disalin ke perangkat lain bisa membawa tanggal salinan, bukan tanggal pemotretan.
- Duplikat = **isi byte identik**. Foto yang sama tetapi diubah ukuran/dikompres bukan duplikat persis dan tidak terdeteksi.
- Pada duplikat persis, "ukuran" dan "kualitas gambar" tidak berbeda antarsalinan; pilihan salinan terbaik memakai nama, lokasi, dan tanggal.
- Perubahan di luar aplikasi setelah pemindaian: setiap operasi memeriksa ulang (berkas hilang → *dilewati*, tujuan terisi → *dilewati*), sehingga tidak ada yang tertimpa, tetapi hasilnya bisa tidak persis seperti pratinjau.
- **Pembatalan** mengembalikan nama dan lokasi jika lokasi asalnya masih kosong. Berkas yang dikirim ke Recycle Bin/Trash atau dihapus permanen dari karantina tidak bisa dibatalkan oleh aplikasi.
- Riwayat disimpan di penyimpanan lokal aplikasi; menghapus data aplikasi menghapus riwayat (berkas Anda tidak terpengaruh, tetapi pembatalan lewat aplikasi tidak lagi mungkin).
