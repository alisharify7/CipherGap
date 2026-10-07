# CipherGap 🔒

<img src="CipherGap/assets/ciphergap.svg" width="80" height="80" alt="CipherGap logo"/>

**CipherGap** is an open-source Chrome and Firefox extension for private messaging. **Bale Web, Eitaa Web, Telegram Web A, Rubika Web and Soroush Plus Web** are supported on desktop. WhatsApp remains in development. The published Android preview currently supports Bale, Eitaa and Telegram Web A. Telegram Web K is not supported.

Messages are encrypted locally in your browser before being sent, ensuring that only users with the shared secret can read the original content.

## Features

* AES-256-GCM message and attachment encryption in the browser
* Per-chat keys and optional automatic message decryption
* An installation guide for recipients without CipherGap, hidden while the extension is enabled
* Separate Security, Files, Settings and About (with the guide) pages with light/dark themes
* Compact chat controls with icons, native light/dark surfaces and per-chat pause
* Encrypted Unicode emoji and static/animated stickers, shown inside the message
* Decrypt and preview images, play audio/video, or download the original file
* Optional automatic download/decryption of newly received files
* ECDH P-256 key exchange with a six-digit SAS verification step
* Persistent peer-fingerprint change warnings (TOFU)
* In-chat accept/decline controls, a countdown and a 15-minute exchange deadline
* Manifest V3 with no external servers or cloud processing
* Password-encrypted full/chat backups and offline key QR generation/scanning

[Support CipherGap](https://www.coffeete.ir/alisharify7)

[Security interface](docs/images/security.png) · [File interface](docs/images/files.png)

[Changelog](CHANGELOG.md) · [Release notes for v1.7.0](docs/releases/v1.7.0.md)

## Installation

### Manual Installation

```bash
git clone https://github.com/alisharify7/CipherGap.git
```

1. Open `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the inner `CipherGap/` directory that contains `manifest.json`

The extension is now ready to use.

### Firefox (desktop)

Firefox desktop 140 or newer is required. Download the [`firefox` branch](https://github.com/alisharify7/CipherGap/tree/firefox), or build its package from main with `python3 tools/build_extension.py --target firefox`. The Chrome manifest on main uses a service worker; the generated Firefox manifest uses an event page.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `CipherGap/manifest.json`.
3. Open or refresh the supported messenger.

Temporary Firefox installs are removed when Firefox restarts. For a permanent
install, package and sign the extension through Firefox Add-ons (AMO).

## Usage

1. Open a conversation in [Bale Web](https://web.bale.ai/), [Eitaa Web](https://web.eitaa.com/), [Telegram Web A](https://web.telegram.org/a/), [Rubika Web](https://web.rubika.ir/) or [Soroush Plus Web](https://web.splus.ir/). Eitaa, Telegram and Soroush use numeric chat IDs in the URL hash; Rubika uses its opaque `#c=<chat-id>` route.
2. Open CipherGap's **Security** page and choose **Set up secure chat**.
3. The other participant clicks **Accept request** on the request in the chat. Replacing an existing key requires an additional confirmation.
4. Within 15 minutes of sending the request, compare the six-digit code over a trusted channel, then mark the key verified on both sides. Request expiry does not delete existing chat keys.
5. Use the injected **Encrypt** button to send an encrypted message. Use **Encrypted file** to send `.cgpe` attachments. The messenger’s ordinary attachment picker sends ordinary files.

A manually shared key is available under **Settings → Advanced**, but it remains marked unverified.

Encrypted messages end with a Persian installation guide and both GitHub and the installation website links.
CipherGap hides this guide in the conversation while enabled and shows it again
when paused. Both participants should use 1.4.0 for Eitaa or Telegram (1.3.0 or later
can read the guide on Bale); older encrypted messages remain readable with their original key.

Open **Files → Choose secure files**, or use **Encrypted file** in the chat’s CipherGap toolbar.
Select files and confirm the messenger’s preview, which contains encrypted `.cgpe` files.
The receiver clicks **Open** to open images or a native audio/video player inside the chat, with **Download** to save the original. Unsupported formats remain downloadable; HTML and SVG are never embedded. Enable
**Files → Receive files automatically** separately in each chat to download and
decrypt newly received attachments while that conversation is open. Previously
received files require a click; opening a chat does not download its history.
The original filename is retained. If direct download is unavailable, download
the `.cgpe` through the messenger and use **Choose downloaded file instead**.

## Transfer keys and settings

Open **Transfer** in the popup. Enter a separate backup password of at least
10 characters, then choose **Export everything** or **Export this chat**.
The `.ciphergap` file is encrypted locally with PBKDF2-SHA256 (250,000 iterations,
a random 16-byte salt) and AES-256-GCM. Keep the password separately; CipherGap
cannot recover it. No backup or key is sent to a server.

On your other device, enter the same password and choose **Import a backup**.
**Restore to original chats (my device)** restores saved keys, chat preferences,
partner trust/fingerprints, language, theme and the global enabled setting.
Existing unrelated conversations are retained. You must sign into the same
messenger accounts separately: backups contain no messenger sessions or history.
Pending exchanges, replay nonces and previously downloaded-file markers are
runtime state and are not transferred.

To give your partner one key, export a chat backup and select **Use key in
current chat (partner)** on their device. This maps only the key to their current
conversation; their chat ID can differ from yours and your trust record is not
copied. Every import previews the number of chats and replaced keys and requires
confirmation. Active key exchanges must finish or be declined first.

**Show key QR** shares the exact UTF-8 key as `ciphergap-key:1:<Base64>`.
Anyone who sees it can obtain the key. Show it privately. The recipient opens
the destination chat and uses **Scan with camera**, **Read QR image**, or
**Paste scanned key**, then reviews the import. Shared keys remain unverified.
QR generation and scanning work offline; camera access stops on close/hide.

The shared transfer format works in Chrome/Firefox and Android **0.1.3+**.
Older APKs do not include this screen. Build the updated Android branch or use
its tested debug APK; messenger accounts and WebView compatibility remain
separate prerequisites. Future format readers must retain version 1 support.

## Emoji and stickers

Use **Emoji & stickers** (the smile icon) in CipherGap's chat toolbar.
**Emoji** inserts Unicode into your draft; press **Encrypt** to send it securely.
Native image-backed Unicode emoji, skin tones and joined emoji sequences are retained.

Under **Stickers**, choose a built-in emoji sticker or **Choose sticker file**.
PNG, JPEG, WebP, GIF, AVIF and animated WebM are supported, up to **5 MB**.
The messenger preview contains only a `.cgst.cgpe` encrypted file. Confirm Send there.
The receiver clicks **Open** to show the authenticated sticker inside its message.
Click an image for a larger view or use **Download** to save its original bytes.
Animated WebM uses native playback controls; no autoplay is required.

Both participants need **1.5.0** for inline stickers. The sticker purpose, original
name and media type are sealed inside the existing CGPE encrypted body. Saved
keys, legacy text and normal CGPE files remain compatible. Ordinary native
sticker menus send ordinary stickers; Telegram custom emoji packs and TGS/Lottie
are not intercepted. Use CipherGap's picker for encrypted stickers.

## Language and pause controls

Choose **فارسی / English** in the popup header. Language is shared with the chat controls and persists locally. The UI supports RTL/LTR and bundled Vazirmatn/Inter fonts.

Under **Settings**, turn **CipherGap enabled** off to pause all chats, or **Enabled in this chat** off to pause only the current conversation. The in-chat **Pause chat / Enable chat** button controls the same setting. Keys are retained; encryption, incoming decryption, automatic file downloads and new key exchanges stop while paused. Decrypted text and sticker previews are removed immediately; original ciphertext and installation links are restored.

[Website and installation guide](https://alisharify7.github.io/CipherGap/) · [Website branch](https://github.com/alisharify7/CipherGap/tree/website)

## Tech Stack

* JavaScript
* HTML/CSS
* WebExtensions API (Manifest V3 for Chrome and Firefox)
* AES Encryption

## Architecture

Messenger-independent code lives in `CipherGap/share/`. It is the single source
of truth for message and key-exchange formats, AES/ECDH utilities, the CGPE file
container, storage-key names, adapter registration, media viewer, sticker envelope/picker, shared chat presentation, exchange cards and theme tokens. The shared chat lifecycle, file handoff, message rendering and UI mounting live in `CipherGap/content/chat_runtime.js`. Small `bale.js`, `eitaa.js` and `telegram.js` modules supply native selectors, input/send behavior and attachment controls.

Integrations use stable IDs, roles, message/document data attributes and structural attachment children. They do not select messenger CSS classes. Native layout identifies incoming/outgoing rows. Telegram’s native editor receives input events; its send control is resolved only after the draft appears.
The small MAIN-world bridge observes native Blob downloads, handles Eitaa’s bounded Service Worker download path, and transfers only
the requested encrypted container to the isolated content script. Keys and cryptographic operations stay in the isolated content script. Decrypted
text and previews are displayed in the messenger DOM and can be read by that page. Message drafts are
preserved during key exchange, and asynchronous sends are bound to their chat.

Future WhatsApp integrations should implement the messenger
adapter contract documented in `CipherGap/share/README.md`; they must not copy
encryption or packet-format code. Format upgrades add a new immutable codec and
keep old readers registered, so existing messages and files remain compatible.

Telegram, Rubika and Soroush expose no machine-readable sending timestamp. Automatic receiving ignores the initial one-second settling period and messages at or below the observed message-ID baseline; missed or historical files remain available through **Open**. Undated legacy exchange requests on Telegram require a new timed request. Eitaa’s app-encrypted cache (when an app passcode is enabled) falls back to native download handling. The manual downloaded-file option remains available on every platform.

## Security

* Encryption and decryption occur entirely on the client side.
* Incoming key exchanges require explicit approval and remain unverified until the SAS codes are compared.
* Peer fingerprints are retained when a chat key is cleared so unexpected identity changes can still be detected.
* CGPE v1 authenticates the complete file before preview/playback and applies a 100 MB safety limit. Playback uses local decrypted bytes, not network streaming.
* CipherGap has no backend; plaintext processing happens locally before ciphertext is sent through the messenger.
* Source code is publicly available for review and auditing.

> CipherGap improves privacy on supported messaging platforms, but users should independently review the cryptographic implementation before relying on it for highly sensitive communications.

## Contributing

Run the regression checks with `node --test tests/*.test.js`.
Both browser packages share every source file except the generated manifest.
[Firefox builds and automatic branch synchronization](docs/firefox.md) includes
package and isolated browser checks.
See [the browser validation record](docs/browser-validation.md) for the tested
two-account Bale workflows and current limits.

Contributions, bug reports, and feature requests are welcome.

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

Released under the MIT License.

---

⭐ If you find CipherGap useful, consider starring the repository.

New messenger browser checks: `python3 tests/browser_messengers.py` (Playwright/Chromium) and `PYTHONPATH=/tmp/ciphergap-firefox-tools python3 tests/browser_messengers_firefox.py` (Marionette; install `marionette-driver` in your chosen environment). These use isolated profiles and sanitized DOM fixtures. Live account checks and limits are recorded in [browser validation](docs/browser-validation.md).
