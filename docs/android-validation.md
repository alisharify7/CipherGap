# Android 0.1.4 feature parity validation — 2026-10-08

`assembleDebug`, `lintDebug`, `assembleRelease` and `lintRelease` passed. Android
0.1.4 uses version code 6 and the existing production signing certificate.
`tests/verify_android_release.py` passed signature, non-debuggable manifest,
version/API values and all packaged shared-core hashes. Every `CipherGap/`
source file matches the main worktree byte for byte. The Node suite passes
38 checks, including native whitespace normalization during delayed sends.
Both package checks pass, including exact CSS joining and host/path/iframe guards.

`tests/browser_android.py` passed on the disposable API 36 emulator with Cromite
WebView 147.0.7727.56 for **Bale, Eitaa, Telegram Web A, Rubika and Soroush Plus**:

- Exchanges started from the actual security screen, matching keys and SAS,
  with Android chat-card acceptance/replacement also checked for Rubika/Soroush.
- Encrypted Persian/Unicode text in both directions, touch emoji insertion,
  built-in encrypted stickers, custom stickers selected through Android's
  native picker and exact custom-sticker bytes decoded by desktop.
- Native encrypted-file upload, exact desktop downloads, authenticated image,
  audio/video playback, corruption rejection, expiry, pause and page-world isolation.
- Shared picker styles/box sizing, 44px secure-send touch target and phone widths;
  English/light and Persian/dark launcher, guide and security screens.
- Protected storage, keyboard/Back, persisted keys and persistent HTTPS cookie,
  confirmed deletion, notification permission and incoming-only generic delivery
  without history/outgoing/duplicates or background delivery.

The **signed release APK** was installed and checked by
`tests/browser_android_transfer.py`: exact desktop/Android backups, both-way text,
native saving, QR generation/image import, unverified partner trust, camera
permission denial/grant and cleanup, denied messenger camera and EN/FA layouts
all passed. Its actual launcher reports `0.1.4`, `debug: false` and five supported
messengers. The engineering emulator permits CDP checks for the release build;
physical phones, live messenger-account delivery and a physical-camera scan
remain untested.

Desktop Chromium Rubika/Soroush checks also passed exchanges, expiry, encrypted
text/files, exact downloads, mobile/desktop alignment, isolation and pause.
The main-branch Android synchronization workflow is prepared to copy/test/build
future shared-core changes before updating the Android branch; it was validated
locally as YAML, without running a remote CI job in this session.

The signed APK and checksum are distributed in the [Android 0.1.4 release](https://github.com/alisharify7/CipherGap/releases/tag/android-v0.1.4).

# Android 0.1.3 signed release validation — 2026-10-07

`assembleRelease` and `lintRelease` passed, with zero lint errors and one
OldTargetApi advisory. The release targets API 36, supports installation from
API 26 and uses version code 5. `tests/verify_android_release.py` verifies the
APK signature against the committed public certificate, a non-debuggable
manifest, its version/SDK values and every packaged shared-core source hash.
Production certificate SHA-256:
`62eec94b261348313fd379124c7e118ac126878eff5062cfae00ba0edeae9718`.
Private signing material is not committed or uploaded.

The actual signed APK installed and launched on the disposable API 36 emulator;
the launcher displayed `Android 0.1.3 · Release`, and Android denied `run-as`
because the app is not debuggable. The full desktop/Android transfer check also
passed on that APK: exact backups/keys/trust, both-way encrypted text, native
file saving, QR export/import, camera permission/cleanup and EN/FA layout.

The emulator runs an Android engineering image (`ro.debuggable=1`), on which
[Chromium forces WebView debugging](https://github.com/chromium/chromium/blob/133.0.6943.137/android_webview/glue/java/src/com/android/webview/chromium/SharedStatics.java).
That permits these isolated fixture checks even for a release APK. The app
requests WebView debugging only when `BuildConfig.DEBUG` is true; it is false
in this release. Physical-phone/provider behavior remains a separate check.

Direct downloads use the production signing identity. Older debug builds need
the backup/uninstall/restore migration described in the Android README. The
old backup-enabled debug APK remains available solely for that migration.

# Android 0.1.3 transfer validation — 2026-10-07

`assembleDebug` and `lintDebug` passed with shared core 1.7.0. Both package
checks passed and popup/shared source matched main byte for byte. Version code
is 4; the APK retains the existing debug signing certificate (SHA-256
`99bf58db121ccc988e5bf97ec104337e0ff9e86c3dfa2c69ae4a1aac3a823e11`).

`tests/browser_android_transfer.py` passed on a disposable Android 16/API 36
x86_64 emulator with the compatible Cromite WebView 147.0.7727.56 provider:

- A desktop encrypted backup was imported with Android's native file picker;
  exact Persian/emoji keys, theme/language, chat flags and personal trust survived.
- Messages encrypted on desktop decrypted in the actual Android messenger
  WebView, and Android encrypted text decrypted on desktop with the exported key.
- Android exported a full backup through its native save dialog; desktop opened
  it and matched the complete portable snapshot. The filename retains `.ciphergap`.
- Android generated/saved an actual key QR PNG; desktop decoded its exact key.
  Android imported it through its native image picker into another chat and kept
  partner identity unverified.
- Camera denial/grant, a live emulator camera stream, track cleanup on close and
  denial to messenger pages after approval passed. The system permission dialog
  no longer cancels its own pending camera request. EN/FA mobile layouts fit.

The existing Bale/Eitaa/Telegram WebView/desktop workflows also passed ECDH/SAS,
text/emoji, native encrypted file/media transfer, pause and isolation. Settings,
trusted keyboard touch, Back, persisted sessions/keys and confirmed data clearing
passed. Generic notifications also passed permission handling, incoming exchange
notifications, history/outgoing/duplicate exclusion and no background delivery.
The keyboard test now reuses its CDP touch helper instead of relying on
a potentially stale UIAutomator XML snapshot from an animated WebView.

These are real WebView/native-dialog checks with isolated messenger fixtures.
No physical-phone camera scan or live messenger-account delivery is claimed.
Chromium additionally scanned a synthetic QR camera feed; Firefox decoded QR
pixels and restored its native backup download. Existing provider limitations
below apply. The published 0.1.2 APK does not contain these source changes.

# Android 0.1.2 validation — 2026-10-06

Built and linted successfully with the existing pinned toolchain and packaged
shared core 1.6.1. The APK signature matches 0.1.1, and `adb install -r`
succeeded. No physical phone or live Android-account delivery is claimed.

The complete emulator check passed Bale, Eitaa and Telegram Web A: two-party
ECDH/SAS through the actual security screen, text/Unicode emoji, native encrypted
file selection, authenticated media, exact downloads, corruption, expiry, pause
and isolated key access. Settings, keyboard/Back, persisted sessions/keys,
confirmed deletion, private encrypted storage and generic notifications also
passed, including denial/grant, history/outgoing/duplicate exclusion and no
background delivery. The notification switch now reflects permission denial
immediately. Mobile toolbar checks compare with the actual typing surface.

Both package checks passed. Emulator and compatible-provider limitations from
the reports below still apply; new desktop messengers are not Android origins.

# Android 0.1.1 validation — 2026-10-05

The 0.1.1 APK passed assembleDebug/lintDebug on the toolchain below. The full
Android check passed all three messenger fixtures, starting exchanges through
the actual local security screen and sending through trusted WebView touch input.
Bale’s regression uses a native textarea; Eitaa/Telegram include image-backed
native emoji. Removing and restoring the editor preserves messenger detection.
The secure row remains above the composer within the viewport; its custom media
picker is absent. Encrypted desktop stickers still decode inline on Android.

Native file picking/saving, exact downloaded bytes, media playback, corruption,
expiry, pause, isolated key access, protected storage, keyboard/Back, persisted
sessions/keys, notification denial/grant/generic delivery/deduplication and
confirmed clearing all passed. Launcher and security screens were visually
reviewed in English/light and Persian/dark. The updated source passes 35 Node
checks, both package checks and Chrome/Firefox messenger integrations.

Separate live checks used a disposable copy of the existing Your Chrome profile,
a mobile WebView user agent, a 393 × 780 viewport and the mobile presentation hooks
in Chromium. Encrypted text and Unicode emoji were sent/decrypted in the authorized
Eitaa/Telegram Saved Messages chats. The check exposed delayed Send/draft updates;
after fixing the shared sender, both succeeded with no composer overlap. These
self-chat messages remain in the accounts. The disposable profile and its test
keys were deleted; the original browser profile and keys were not changed.
Bale required login in that isolated profile. **No live Android account delivery
or physical-phone compatibility is claimed.** The emulator/provider limitations
below still apply. Native messenger stickers are not encrypted automatically.

# Android 0.1.0 validation — 2026-10-05

## Environment and scope

Built with JDK 17, Gradle 8.13, AGP 8.13.2, SDK/build-tools 36 and
AndroidX WebKit 1.17.1. Tested on a Pixel 5 x86_64 Android 16/API 36 emulator.
The test provider was **Cromite WebView 147.0.7727.56**, installed only in the
emulator. The APK does not bundle or require that particular vendor's engine.

The emulator's original Google WebView 133 did not expose the required isolated
world API. CipherGap disabled messenger launch and displayed its update guide.
No page-world crypto fallback was used. Modern Google WebView providers, physical
phones and Android 8 execution have **not** been validated here. Min SDK 26
permits installation on Android 8, but a compatible provider is a separate
requirement and may not be available on older devices.

Messenger checks used sanitized native DOM fixtures inside a real Android WebView
and a real desktop Chromium extension. They exercised actual shared code, native
document picking/saving and playback. They did not log into accounts, contact
anyone, or establish delivery through the live messenger services.

## Results

| Check | Result |
| --- | --- |
| assembleDebug, installation and APK signature | Pass |
| lintDebug | 0 errors; one warning that newer Gradle is available |
| Shared protocol/crypto/workflow suite | 34 passed |
| Chrome/Firefox package parity and Android source/hash packaging | 2 passed |
| English/light and Persian/dark launcher, guide, local fonts and widths | Pass |
| Shared security popup, verified state, both languages/themes, touch layout | Pass; screenshots visually reviewed |
| Android → desktop ECDH, matching keys and SAS verification | Pass: Bale, Eitaa, Telegram Web A |
| Desktop → Android exchange; accept and confirm replacement inside chat | Pass: Bale |
| Text/Unicode emoji in both directions | Pass: all three fixtures |
| Native Android file selection; ciphertext received by messenger upload handler | Pass: all three; desktop download matched original bytes |
| Built-in encrypted sticker upload and desktop inline decoding | Pass: all three |
| Desktop encrypted image, audio, video and passive HTML fallback on Android | Pass: all three; audio/video playback advanced |
| Native Android save dialog | Pass: downloaded PNG matched original bytes |
| Damaged attachment | Pass: authentication error; no decrypted preview |
| Expired exchange | Pass: 00:00 expired card and acceptance rejected |
| Per-chat pause | Pass: plaintext removed from the DOM |
| Page-world access to native bridge, key store and isolated core | Absent on all three fixture pages |
| Protected storage | Synthetic chat key absent from private persisted ciphertext blob |
| Notification permission | Actual Android denial and grant exercised; rejection did not disable app |
| Generic message/exchange notifications; history, outgoing and duplicates | Pass: all three fixtures |
| Notifications after app moves to background | No delivery, as intended |
| Selecting a notification | Returned from Home to its running Bale conversation |
| Android keyboard and Back | Keyboard opened by real touch; Back returned from security to chat |
| Process restart | Synthetic HTTPS session cookie and Keystore-protected key preserved |
| Automatic message decryption preference | Enabled and disabled through the shared popup |
| Clear key and clear browser data | Cancel preserved data; confirmation removed it |

Screenshots of fixture chats are diagnostic only; their surrounding native DOM
has deliberately minimal styling and does not represent the live messenger UI.
Launcher/security captures below show actual packaged app screens.

## Reproduce

See [the build and installation guide](../android/README.md). Install the debug
APK on a **test emulator** with a compatible provider and run:

~~~sh
ANDROID_HOME=/path/to/sdk python3 tests/browser_android.py
node --test tests/shared_core.test.js tests/exchange_expiry.test.js tests/bale_workflows.test.js
python3 -m unittest tests/packages_test.py
~~~

The Android runner uses emulator-5554, Playwright Chromium and Python websockets.
It restarts the test app, changes notification permission, creates only synthetic
chat data, opens native file dialogs, and finally clears the test app's browser
data. It refuses physical devices. Captures and sample files are written under
the ignored dist/android-validation directory.

The local build used the optional Google-Maven mirror because the normal
repository was unreachable from this workstation. SDK archives were obtained
through Google's repository redirector and checked against repository hashes.
Default project repositories remain Google Maven/Maven Central.

## Evidence and next live check

- [English launcher](android-screenshots/home-en.png)
- [Persian launcher](android-screenshots/home-fa.png)
- [English chat security](android-screenshots/security-en.png)
- [Persian chat security](android-screenshots/security-fa.png)
- [Unsupported-provider guide](android-screenshots/unsupported-webview.png)

**Real account testing is pending direct user login.** After installing the APK,
sign in on the messenger's own page, open the authorized test conversation and
repeat exchange/SAS, encrypted text, files and stickers against the desktop
extension. Check the live mobile composer and attachment UI for each messenger.
No production reliability or universal provider/codec compatibility is claimed.

This APK is debug signed and exposes WebView debugging to authorized ADB.
Release builds disable it and require a protected production signing key.
Notifications have no background service or push relay; closing/backgrounding
the app stops notification delivery. Decrypted content displayed in a messenger
page is readable by that page's scripts.

## نتیجهٔ فارسی

نسخهٔ آزمایشی روی شبیه‌ساز اندروید ۱۶ ساخته، نصب و بررسی شد. تبادل کلید،
متن/شکلک، فایل و استیکر با افزونهٔ واقعی Chrome در محیط آزمایشی هر سه
پیام‌رسان سازگار بود. انتخاب/ذخیرهٔ فایل اندروید، پخش رسانه، مجوز اعلان،
حفظ نشست و کلید، کیبورد، بازگشت و تأیید حذف نیز بررسی شدند.

این نتایج مربوط به شبیه‌ساز و داده‌های ساختگی هستند؛ آزمون حساب واقعی بعد از
ورود مستقیم شما انجام می‌شود. نصب روی اندروید ۸ به‌تنهایی تضمین نمی‌کند
WebView سازگار موجود باشد. اعلان پس از رفتن برنامه به پس‌زمینه یا بستن آن
در این نسخه پشتیبانی نمی‌شود.
