## Lessons
- styles.css: `.busy{display:grid}` menimpa atribut hidden; ada `[hidden]{display:none!important}` agar overlay tak memblokir klik.
- Sandbox memblokir dl.google.com & maven.google.com (403): AGP/APK tak bisa dibangun di sini; hanya javac plugin + stub.
- electron/fs-service.cjs: jalur UI relatif ke root; jangan longgarkan rel2abs/protectedReason (uji berkas sungguhan).
- vite.config.ts: keluaran IIFE (bukan modul) agar file:// Electron aman; CSS ikut terinjeksi ke JS.
