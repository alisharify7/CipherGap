# CipherGap Android 0.1.2 — shared core 1.6.1

This preview packages the same 1.6.1 core as Chrome/Firefox. Bale’s secure
controls follow its semantic composer surface; the native editor, ordinary
send and voice controls stay independent. Existing keys, sessions and formats
remain compatible. Rejecting the notification permission also turns the
notification switch off immediately. Android still supports Bale, Eitaa and Telegram Web A;
Rubika and Soroush are desktop integrations in this release.

Install `ciphergap-android-0.1.2.apk` over the previous preview. It uses the same
debug signing identity and a higher version code, retaining local app data.
This is a test APK requiring an isolated-world-compatible WebView.

See [installation/build](../../android/README.md) and
[Android validation](../android-validation.md). Foreground notifications,
privacy boundaries and native sticker limitations are unchanged.

## Validation

Build/lint and the complete emulator compatibility check passed for Bale,
Eitaa and Telegram Web A, including native file dialogs, authenticated media,
exact downloads, key exchange, keyboard/Back, sessions, notifications and
confirmed clearing. This does not claim physical-phone or live Android-account
testing. The APK signing certificate matches the previous preview.
