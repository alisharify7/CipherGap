# CipherGap 🔒

<img src="CipherGap/assets/ciphergap.svg" width="80" height="80" alt="CipherGap logo"/>

**CipherGap** is an open-source Chrome and Firefox extension for private messaging. **Bale Web** is currently supported; Eitaa, Rubika, Telegram and WhatsApp integrations are planned but are not active yet.

Messages are encrypted locally in your browser before being sent, ensuring that only users with the shared secret can read the original content.

## Features

* AES-256-GCM message and attachment encryption in the browser
* Per-chat keys and optional automatic message decryption
* An installation guide for recipients without CipherGap, hidden while the extension is enabled
* Separate Security, Files, Settings and Guide pages with light/dark themes
* A chat security indicator and secure file picker inside Bale's composer
* Decrypt and preview images, play audio/video, or download the original file
* Optional automatic download/decryption of newly received files
* ECDH P-256 key exchange with a six-digit SAS verification step
* Persistent peer-fingerprint change warnings (TOFU)
* In-chat accept/decline controls, a countdown and a 15-minute exchange deadline
* Manifest V3 with no external servers or cloud processing

[Security interface](docs/images/security.png) · [File interface](docs/images/files.png)

[Changelog](CHANGELOG.md) · [Release notes for v1.3.0](docs/releases/v1.3.0.md)

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
3. Open or refresh Bale Web.

Temporary Firefox installs are removed when Firefox restarts. For a permanent
install, package and sign the extension through Firefox Add-ons (AMO).

## Usage

1. Open a conversation in [Bale Web](https://web.bale.ai/).
2. Open CipherGap's **Security** page and choose **Set up secure chat**.
3. The other participant clicks **Accept request** on the request in the chat. Replacing an existing key requires an additional confirmation.
4. Within 15 minutes of sending the request, compare the six-digit code over a trusted channel, then mark the key verified on both sides. Request expiry does not delete existing chat keys.
5. Use the injected **Encrypt** button to send an encrypted message. Use **Encrypted file** to send `.cgpe` attachments. Bale’s ordinary attachment picker sends ordinary files.

A manually shared key is available under **Settings → Advanced**, but it remains marked unverified.

Encrypted messages end with a Persian installation guide and both GitHub and the installation website links.
CipherGap hides this guide in the conversation while enabled and shows it again
when paused. Both participants should use 1.3.0 or later for messages with this
guide; older encrypted messages remain readable with their original key.

Open **Files → Choose secure files**, or use **Encrypted file** above Bale's composer.
Select files and confirm Bale's preview, which contains encrypted `.cgpe` files.
The receiver clicks **Decrypt & view** to open images or a native audio/video player inside the chat, with **Download** to save the original. Unsupported formats remain downloadable; HTML and SVG are never embedded. Enable
**Files → Receive files automatically** separately in each chat to download and
decrypt newly received attachments while that conversation is open. Previously
received files require a click; opening a chat does not download its history.
The original filename is retained. If direct download is unavailable, download
the `.cgpe` through Bale and use **Choose downloaded file instead**.

## Language and pause controls

Choose **فارسی / English** in the popup header. Language is shared with the chat controls and persists locally. The UI supports RTL/LTR and bundled Vazirmatn/Inter fonts.

Under **Settings**, turn **CipherGap enabled** off to pause all chats, or **Enabled in this chat** off to pause only the current conversation. The in-chat **Pause chat / Enable chat** button controls the same setting. Keys are retained; encryption, incoming decryption, automatic file downloads and new key exchanges stop while paused. Existing decrypted text remains visible until the messenger is refreshed.

[Website and installation guide](https://alisharify7.github.io/CipherGap/) · [Website branch](https://github.com/alisharify7/CipherGap/tree/website)

## Tech Stack

* JavaScript
* HTML/CSS
* WebExtensions API (Manifest V3 for Chrome and Firefox)
* AES Encryption

## Architecture

Messenger-independent code lives in `CipherGap/share/`. It is the single source
of truth for message and key-exchange formats, AES/ECDH utilities, the CGPE file
container, storage-key names, adapter registration, media viewer, exchange cards and theme tokens. Bale-specific selectors,
DOM observers, composer behavior, and mounting stay in `CipherGap/content/bale.js`.

Bale integration uses stable composer/scroller IDs, accessible labels, message
metadata and structural attachment children, without generated Bale class names.
The small MAIN-world bridge observes native Blob downloads and transfers only
the requested encrypted container to the isolated content script. Keys and cryptographic operations stay in the isolated content script. Decrypted
text and previews are displayed in the messenger DOM and can be read by that page. Message drafts are
preserved during key exchange, and asynchronous sends are bound to their chat.

Future Eitaa, Rubika, Telegram and WhatsApp integrations should implement the messenger
adapter contract documented in `CipherGap/share/README.md`; they must not copy
encryption or packet-format code. Format upgrades add a new immutable codec and
keep old readers registered, so existing messages and files remain compatible.

## Security

* Encryption and decryption occur entirely on the client side.
* Incoming key exchanges require explicit approval and remain unverified until the SAS codes are compared.
* Peer fingerprints are retained when a chat key is cleared so unexpected identity changes can still be detected.
* CGPE v1 authenticates the complete file before preview/playback and applies a 100 MB safety limit. Playback uses local decrypted bytes, not network streaming.
* CipherGap has no backend; plaintext processing happens locally before ciphertext is sent through Bale.
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
