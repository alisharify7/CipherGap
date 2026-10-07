# Android 0.1.4 — 2026-10-08

Android now supports Bale, Eitaa, Telegram Web A, Rubika and Soroush Plus through the same messenger adapters and feature implementation as the desktop extension.

- Restore the shared emoji and encrypted sticker picker, including custom stickers selected with Android's native file picker.
- Preserve encryption, ECDH/SAS exchanges, encrypted files/media, expiry, pause, backups and key QR across Android and desktop.
- Derive supported URLs and injection paths from the extension manifest; reject unsupported hosts, paths and frames.
- Fix shared dialog/theme CSS bundling and 44px mobile send controls.
- Wait for native draft clearing when a messenger normalizes whitespace before sending.
- Add validated main-to-Android synchronization for future shared-core changes.

The APK uses version code 6, Android 8+ (minSdk 26), targetSdk 36 and the existing production signing certificate. App and WebView debugging are disabled. Existing production-signed 0.1.3 installations can update directly. Older debug-signed previews require an encrypted backup before migration; see [the Android installation guide](https://github.com/alisharify7/CipherGap/blob/android/android/README.md#install-and-use).

Validation passed: 38 Node checks, package/source parity and URL guards, Android debug/release builds and lint, signature and embedded source hashes, emulator exchanges/messages/files/stickers/notifications for all five messengers, and signed-release desktop/Android backup and QR transfer checks. Desktop Rubika/Soroush regression checks passed. Tests use sanitized fixtures; physical phones, live messenger accounts and physical-camera scanning were not tested.

Download `ciphergap-android-0.1.4.apk` and verify it against `SHA256SUMS`. Encryption requires a WebView supporting isolated-world JavaScript; the launcher checks compatibility.
