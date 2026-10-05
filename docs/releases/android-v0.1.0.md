# CipherGap Android 0.1.0 — preview

An installable messenger browser with CipherGap encryption for Bale, Eitaa and
Telegram Web A. The desktop extension and Android app share the same core and
packet formats. The launcher, fonts and light/dark Persian/English UI match the
website/extension. Conversation security reuses the existing popup.

Includes timed ECDH/SAS exchange, encrypted text/emoji/files/stickers, passive
media previews, native document picking/saving, local protected key storage,
global/per-chat pause, generic active-app notifications and an offline guide.

Install the attached test APK and sign in directly to a messenger. See
[installation/build instructions](../../android/README.md) and
[validation evidence](../android-validation.md).

This is a debug-signed prerelease. Encryption requires an isolated-world-capable
WebView; Android 8+ installation alone is insufficient. No native messenger app
modification, closed-app push, calls, camera or microphone support is included.
CipherGap does not send chats/keys to its developer. Decrypted content displayed
inside a messenger page is still readable by that page's scripts.
