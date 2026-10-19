# Panduan build

> **Status:** di lingkungan tempat proyek ini ditulis, Android SDK dan repositori Maven Google tidak bisa diakses, jadi **APK belum pernah dibangun dan belum diuji di perangkat**. Langkah Android di bawah adalah prosedur standar Capacitor yang belum dijalankan di sini. Jika build gagal, laporkan keluaran Gradle-nya; jangan menganggap APK sudah ada sebelum `app-debug.apk` benar-benar muncul.

## 0. Prasyarat umum

- Node.js **22.12+** dan npm
- `npm install` di akar proyek
- `npm test` harus hijau sebelum membangun apa pun

## 1. Aplikasi desktop

### Menjalankan untuk pengembangan
```bash
npm run desktop          # build UI lalu buka Electron
```

### Windows (installer `.exe`)
Bangun **di Windows** (atau lewat CI):
```bash
npm run dist:win         # hasil: release/Berkas Rapi Setup 0.1.0.exe
```
Installer tidak bertanda tangan, jadi SmartScreen menampilkan "Windows protected your PC" → *More info → Run anyway*. Untuk menghilangkannya diperlukan sertifikat code-signing (atur `CSC_LINK` dan `CSC_KEY_PASSWORD` sebagai rahasia CI; jangan menaruhnya di repositori).

### macOS (`.dmg`)
Harus dibangun **di macOS** (atau runner `macos-latest`):
```bash
npm run dist:mac         # hasil: release/Berkas Rapi-0.1.0-arm64.dmg dan -x64.dmg
```
Tanpa Apple Developer ID dan notarisasi, Gatekeeper memblokir pembukaan pertama: klik kanan aplikasi → *Open*. Untuk distribusi publik, tanda tangani dan notarisasi (`CSC_LINK`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`; lihat dokumentasi electron-builder).

## 2. Android (APK)

### 2a. Prasyarat
- **JDK 21** (Capacitor 8 mengompilasi dengan Java 21)
- **Android SDK**: pasang Android Studio, atau *command-line tools* saja, lalu:
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk          # sesuaikan
  yes | sdkmanager --licenses
  ```
  Gradle akan mengunduh platform `android-36` dan build-tools yang dibutuhkan setelah lisensi disetujui.
- Akses internet **saat build** ke `dl.google.com` (Google Maven) dan `services.gradle.org`. Aplikasinya sendiri tidak memakai internet.

### 2b. APK debug (paling mudah, langsung bisa dipasang)
```bash
npm install
npm run android:apk
```
Perintah itu: membangun UI (`vite build`) → menyalin ke proyek Android (`cap sync android`) → `./gradlew assembleDebug`.

Hasil: `android/app/build/outputs/apk/debug/app-debug.apk` — sudah ditandatangani otomatis dengan kunci debug, sehingga **dapat dipasang** tanpa langkah penandatanganan.

Dengan Android Studio: `npx cap open android` → *Build ▸ Build APK(s)*.

### 2c. Memasang APK
- **Kabel/ADB:** aktifkan *Developer options ▸ USB debugging*, lalu `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
- **Tanpa kabel:** salin APK ke ponsel, buka dari aplikasi File, izinkan *Install unknown apps* untuk aplikasi tersebut saat diminta.
- Saat pertama memilih folder, Android menampilkan pemilih folder sistem; aplikasi tidak meminta izin penyimpanan.

### 2d. APK rilis bertanda tangan sendiri
Buat kunci sekali dan **simpan di luar repositori** (kehilangannya berarti tidak bisa memperbarui aplikasi yang sudah terpasang):
```bash
keytool -genkeypair -v -keystore ~/berkas-rapi.jks -alias berkasrapi \
        -keyalg RSA -keysize 4096 -validity 10000
export BERKAS_KEYSTORE=$HOME/berkas-rapi.jks
export BERKAS_KEYSTORE_PASSWORD='…'
export BERKAS_KEY_ALIAS=berkasrapi
export BERKAS_KEY_PASSWORD='…'
npm run android:sync && (cd android && ./gradlew assembleRelease)
```
Hasil: `android/app/build/outputs/apk/release/app-release.apk`. Tanpa variabel `BERKAS_KEYSTORE` hasilnya `app-release-unsigned.apk`, yang **tidak bisa dipasang**. Verifikasi tanda tangan: `apksigner verify --print-certs app-release.apk` (ada di folder `build-tools` SDK).

Untuk Google Play diperlukan AAB (`./gradlew bundleRelease`) dan akun pengembang; di luar cakupan di sini.

### 2e. Setelah mengubah UI
Selalu `npm run android:sync` (atau `android:apk`) supaya aset web terbaru ikut tersalin ke proyek Android.

## 3. CI (GitHub Actions)

`.github/workflows/build.yml` menjalankan tes, lalu membangun installer Windows, `.dmg` macOS, dan APK debug Android sebagai artifact. Versi action di dalamnya belum diverifikasi sebagai yang terbaru; periksa sebelum dipakai rutin.

## 4. Pengujian

| Perintah | Isi |
|---|---|
| `npm run typecheck` | TypeScript strict |
| `npx vitest run tests/core.test.ts` | Logika inti |
| `npx vitest run tests/fs-service.test.ts` | Layanan berkas desktop pada folder sungguhan (temp) |
| `npx vitest run tests/e2e.test.ts` | UI di Chromium. Perlu `npm run build` dan Chromium dari Playwright di `/opt/pw-browsers/chromium-1194` (dilewati bila tidak ada). `E2E_SHOTS=./shots` menyimpan tangkapan layar. |

Yang **tidak** tercakup tes otomatis: plugin SAF di perangkat nyata, peluncuran Electron, installer.

## 5. Pemecahan masalah

| Gejala | Penyebab umum |
|---|---|
| `SDK location not found` | Setel `ANDROID_HOME` atau buat `android/local.properties` berisi `sdk.dir=/path/ke/Sdk` |
| `Failed to install the following Android SDK packages … licenses` | `yes \| sdkmanager --licenses` |
| `Unsupported class file major version` | Gunakan JDK 21 |
| Layar putih di Android | Jalankan `npm run android:sync`; pastikan `dist/` terbentuk |
| Electron: `Electron failed to install correctly` | Unduhan binary diblokir jaringan; `npm install` ulang tanpa `ELECTRON_SKIP_BINARY_DOWNLOAD` |
