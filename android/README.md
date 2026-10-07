# CipherGap Android

An installable browser for Bale, Eitaa and Telegram Web A using the desktop
extension's encryption core. It does not modify native messenger apps.
Rubika and WhatsApp are shown as in development.

## Install and use

1. Download [ciphergap-android-0.1.3.apk](https://github.com/alisharify7/CipherGap/releases/download/android-v0.1.3/ciphergap-android-0.1.3.apk)
   from the [Android 0.1.3 release](https://github.com/alisharify7/CipherGap/releases/tag/android-v0.1.3).
   [SHA-256 checksums](https://github.com/alisharify7/CipherGap/releases/download/android-v0.1.3/SHA256SUMS) are included.
2. Allow installation from your browser/Files app for this installation, install
   the APK, then disable that permission again.
3. Choose a messenger and sign in **on its own website**.
4. Open a conversation and **Chat security**. Your partner needs CipherGap on
   Android or desktop. Start an exchange; accept it on the other device; compare
   the six-digit SAS over a trusted channel and mark it verified. Requests expire
   after 15 minutes. Never send a chat key as an ordinary message.
5. Use CipherGap's encrypted send and file controls. Ordinary messenger
   controls still send normally. Tap received ciphertext to decrypt locally;
   preview supported media and use Download to select where to save it.

The APK installs on Android 8+, but encryption additionally requires a WebView
provider supporting `JS_INJECTION_IN_FRAME_AND_WORLD`. An older Android version
does not guarantee that a compatible provider is available. The launcher disables
messenger buttons and explains the update requirement if it is missing. There is
no insecure page-world fallback.

The download is a **production-signed release APK** with app and WebView debugging
disabled. It is distributed directly; no Google Play publication is involved.
The signing certificate is public in `android/ciphergap-release-cert.pem`;
the private signing key and password must stay outside the repository.

Older preview APKs used the Android debug certificate and cannot update directly
to this signature. **Before uninstalling a debug build**, use Transfer to export
a password-encrypted full backup. Install the release, sign in to your messenger
accounts again and restore the backup. Uninstalling without a backup deletes
local keys. Future releases signed with this production identity update normally.

## Build

Install JDK 17, Python 3, Android SDK platform 36 and build-tools 36.0.0; accept SDK licenses
and set `JAVA_HOME`/`ANDROID_HOME`, then run from the repository root:

```sh
./android/gradlew -p android assembleDebug lintDebug
```

Debug output: `android/app/build/outputs/apk/debug/app-debug.apk`.

For a signed release, set `CIPHERGAP_SIGNING_STORE` to your private keystore,
`CIPHERGAP_SIGNING_STORE_PASSWORD` and `CIPHERGAP_SIGNING_KEY_PASSWORD` to its
passwords, and `CIPHERGAP_SIGNING_ALIAS` to the key alias (default `ciphergap`).
Supply secrets through your local environment; do not commit them. Then run:

```sh
./android/gradlew -p android assembleRelease lintRelease
python3 tests/verify_android_release.py
```

Release output: `android/app/build/outputs/apk/release/app-release.apk`.
Verification requires `ANDROID_HOME` and optionally `JAVA_HOME` for the SDK/JDK.
Back up the signing identity securely; updates must retain its certificate.
Release signing fails when credentials are missing rather than using a debug key.
Gradle 8.13 (SHA-256 checked), AGP 8.13.2 and AndroidX WebKit 1.17.1 are pinned.
Google Maven is the default. If it is unavailable, an optional mirror URL may be
provided through `CIPHERGAP_MAVEN_MIRROR`. No browser engine is bundled.

## Shared source and security

`tools/build_android_assets.py` packages the current `CipherGap/` files in
manifest order. Generated assets are ignored and carry `core-sources.json`
hashes. The ciphertext bridge runs in the page world; crypto, adapters and the
runtime run in a named isolated world. The existing popup is reused for trusted
local conversation settings; mobile CSS and a limited native host shim adapt it.

The optional shared `CipherGapHost` hooks cover downloads, incoming-message
metadata and trusted-UI localization. Cryptography, formats, ECDH, expiry and
media authentication remain shared. The native bridge is restricted to the
local app origin or supported main-frame messenger origins in the isolated
world. Remote page scripts and iframes do not receive its privileges.

Keys/settings are an authenticated AES-GCM blob in private app storage, protected
with an Android Keystore key. Cloud backup and device transfer are excluded.
Ephemeral ECDH private material stays in JS memory. Downloads use bounded chunks
and private temporary files, then a user-selected document URI. Cancellation and
the next launch after a crash remove temporary files.

CipherGap has no developer chat server, analytics SDK, notification relay or
remote key storage. It processes content locally. The messenger still receives
login information, ciphertext and normal account metadata. **Plaintext displayed
inside a messenger page is readable by that page's JavaScript.**

## Preferences and limitations

- Offline Inter/Vazirmatn fonts, Persian/English, light/dark appearance.
- Global/per-chat pause, automatic decryption and key removal reuse the popup.
- Clearing browser data confirms before removing sessions, keys and preferences;
  it does not delete messenger history.
- Generic notifications need permission and a running page while the app is
  open. No message text, attachment names or keys appear. History/outgoing rows
  are excluded; selecting a notification opens its conversation.
- The Transfer screen exports/imports password-encrypted full or single-chat
  backups with the same portable format as Chrome/Firefox. QR images contain
  the actual shared key. Share privately; partner imports stay unverified.
- Camera access is requested only by the local key QR scanner. Messenger pages
  and microphone requests are denied, including after scanner approval.
- No closed-app delivery, background service, push relay or calls.
- One active messenger WebView. Switching messengers preserves cookies but
  reloads the page; a pending exchange may need to be restarted.
- Real account tests require direct user login. Sanitized DOM fixture success
  does not establish compatibility with every future mobile DOM change.

## Repeat tests and update the core

Use a test emulator with a compatible WebView, install the debug APK, then:

```sh
ANDROID_HOME=/path/to/sdk python3 tests/browser_android.py
ANDROID_HOME=/path/to/sdk python3 tests/browser_android_transfer.py
node --test tests/shared_core.test.js tests/exchange_expiry.test.js tests/bale_workflows.test.js
python3 -m unittest tests/packages_test.py
```

The Android check uses Playwright, `websockets`, desktop Chromium and `ffmpeg`
on PATH for its sample video. Install the Python/browser dependencies with
`python3 -m pip install playwright websockets` and `python3 -m playwright install chromium`.
Use a fresh emulator at `emulator-5554`; this test changes permissions and clears
its synthetic app data. It refuses
physical devices, connects through local ADB forwarding, and uses sanitized
fixtures rather than real accounts. Screenshots go to `dist/android-validation/`.
See `docs/android-validation.md` for actual results.

Merge future `origin/main` changes into `android`, rebuild and rerun compatibility
checks. There is no second cipher implementation to synchronize. The app links
to [its source](https://github.com/alisharify7/CipherGap/tree/android) and
[the website](https://alisharify7.github.io/CipherGap/).

## راهنمای فارسی

این برنامه مرورگری برای نسخهٔ وب پیام‌رسان‌هاست و اپ اصلی آن‌ها را تغییر
نمی‌دهد. APK آزمایشی را نصب، پیام‌رسان را انتخاب و مستقیماً وارد حساب شوید.
طرف مقابل نیز باید CipherGap داشته باشد. درخواست تبادل کلید را ارسال کنید،
کد شش‌رقمی را از راهی مورد اعتماد مقایسه و تأیید کنید؛ درخواست ۱۵ دقیقه اعتبار
دارد. متن و فایل را با کنترل‌های CipherGap بفرستید؛ کنترل‌های عادی پیام‌رسان
رمزنگاری اضافه انجام نمی‌دهند.

تنظیمات برنامه زبان، تم، فعال‌سازی کلی و اعلان را دارد. «امنیت گفتگو» تنظیمات
همان چت، رمزگشایی خودکار و حذف کلید را نمایش می‌دهد. اعلان فقط هنگام باز بودن
برنامه و اجرای صفحه است. پاک کردن داده‌های مرورگر، ورودها و کلیدهای محلی را
حذف می‌کند و تأیید می‌خواهد. راهنمای کامل دو‌زبانه داخل برنامه موجود است.

## Android 0.1.1 controls

Use **Chat security** (shield) to exchange and verify a key. In the chat, the blue
CipherGap send icon encrypts your draft; the messenger’s own send icon remains
ordinary. The file icon chooses a secure attachment and pause controls this chat.
The secure row is separate from the native text editor, including with the keyboard
open. The app navigation provides Home, Chat security and Settings with icons.

Keyboard/native picker emoji are part of the encrypted text. There is no custom
Android emoji/sticker picker. Native messenger stickers bypass the text/file
composer and are **not** automatically encrypted. Encrypted desktop stickers can
still be decrypted and viewed on Android; send a secure image file when needed.
