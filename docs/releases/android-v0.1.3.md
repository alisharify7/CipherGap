# CipherGap Android 0.1.3 — shared core 1.7.0

The Transfer screen exports/imports encrypted full or single-chat backups with
Chrome/Firefox, and generates/imports actual shared-key QR images. Camera access
is limited to the trusted local scanner; messenger and microphone requests are
still denied. The system permission dialog preserves its pending request while
closing/hiding the app releases the camera. QR secrets must be shown privately.

Mobile navigation retains icons and labels for Security, Files, Transfer,
Settings and About. About links to the website and GitHub; the footer offers
optional financial support. Keys, existing messenger sessions and ciphertext
formats remain compatible. Android supports Bale, Eitaa and Telegram Web A.

The published preview uses version code 5 with a dedicated production signing identity.
App and WebView debugging are disabled. This is a signed release APK for direct
download, not a Google Play publication.

- [Download Android APK](https://github.com/alisharify7/CipherGap/releases/download/android-v0.1.3/ciphergap-android-0.1.3.apk)
- [SHA-256 checksums](https://github.com/alisharify7/CipherGap/releases/download/android-v0.1.3/SHA256SUMS)
- [Desktop 1.7.0 companion release](https://github.com/alisharify7/CipherGap/releases/tag/v1.7.0)

Android 8+ permits installation; encryption additionally requires a compatible
WebView with isolated-world injection. Eitaa numeric/username URLs use the same
fixed shared core as desktop. Older debug-signed installs cannot update directly to the new signature. Export
a password-encrypted full backup **before uninstalling** the old app, then
install this release, sign in to messengers and restore the backup. Future
production releases keep the same signing identity.

[Build instructions](../../android/README.md) and
[validation evidence](../android-validation.md) describe the tested emulator
and compatible WebView provider. Physical-phone/live-account checks are separate.
