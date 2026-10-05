# CipherGap Android 0.1.1 — mobile fixes and a cleaner interface

Messenger detection now survives a web app rebuilding its composer. Sending
reads native text fields correctly, waits for the messenger's Send control and
allows asynchronous draft clearing. It clicks once and retains an unsent draft.
The formats and cryptography remain compatible with the desktop extension.

Android's secure toolbar is outside the native composer on all three messengers,
with separate security, file, pause and blue encrypted-send controls. Keyboard
viewport changes reposition it. The launcher and app navigation use clean icons,
matching colors and expandable bilingual help. Security opens over a running chat.

The separate Android emoji/sticker picker is removed. Use your keyboard or the
messenger's native emoji picker, then the blue CipherGap send icon. Native
messenger stickers are **not automatically encrypted**; encrypted desktop
stickers remain viewable on Android, and image files can be sent securely.

- Android/desktop fixture integration passed for Bale, Eitaa and Telegram Web A,
  including the actual Android security screen, trusted touch sending, textarea
  drafts, image-backed emoji, files, preview/playback, downloads, expiry and pause.
- Emulator keyboard, Back, sessions/keys, permission grant/denial, generic
  foreground notifications and confirmed deletion passed.
- Chrome and Firefox integration and 35 shared Node checks passed.
- Separate live self-chat checks on mobile-size Chromium passed encrypted text
  and Unicode emoji in Eitaa/Telegram. These are not Android account tests.

See [installation/build](../../android/README.md) and
[the detailed test report](../android-validation.md). This remains a debug-signed
preview requiring a compatible isolated-world WebView. Android account tests on
physical phones remain pending. Decrypted text displayed inside a messenger page
can be read by that page's scripts; CipherGap sends no chats or keys to its own
server. Background push, native app modification and native sticker interception
are not included.

## فارسی

تشخیص پیام‌رسان، ارسال رمز‌شده و نمایش کادر تایپ موبایل اصلاح شد. نوار امن
از متن جداست و آیکون آبی برای ارسال رمز‌شده دارد. شکلک کیبورد و منوی خود
پیام‌رسان همراه متن رمز می‌شود؛ دکمهٔ جداگانهٔ شکلک و استیکر حذف شد.
استیکرهای بومی پیام‌رسان خودکار رمز نمی‌شوند. راهنمای دو‌زبانه و رابط خانه و
تنظیمات با آیکون‌های تازه مرتب شده‌اند. این APK همچنان نسخهٔ آزمایشی است.
