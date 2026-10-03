# CipherGap 🔒

The Persian product website lives on this branch. Open `index.html` through a
static server; see [website setup and checks](website/README.md). Desktop and
mobile previews: [desktop](website/preview-1440.png), [mobile](website/preview-390.png).

<img src="CipherGap/assets/ciphergap.svg" width="80" height="80" alt="CipherGap logo"/>

**CipherGap** is an open-source Chrome and Firefox extension for private messaging. **Bale Web** is currently supported; Eitaa, Rubika, Telegram and WhatsApp integrations are planned but are not active yet.

Messages are encrypted locally in your browser before being sent, ensuring that only users with the shared secret can read the original content.

## Features

* AES-256-GCM message and attachment encryption in the browser
* Per-chat keys and optional automatic message decryption
* Separate Security, Files, Settings and Guide pages with light/dark themes
* A chat security indicator and secure file picker inside Bale's composer
* Direct attachment download/decryption and optional automatic receipt of new files
* ECDH P-256 key exchange with a six-digit SAS verification step
* Persistent peer-fingerprint change warnings (TOFU)
* Explicit accept/decline controls for incoming key exchanges
* Manifest V3 with no external servers or cloud processing

[Security interface](docs/images/security.png) · [File interface](docs/images/files.png)

[Changelog](CHANGELOG.md) · [Release notes for v1.1.0](docs/releases/v1.1.0.md)

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

Firefox 128 or newer is required for the attachment download bridge.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `CipherGap/manifest.json`.
3. Open or refresh Bale Web.

Temporary Firefox installs are removed when Firefox restarts. For a permanent
install, package and sign the extension through Firefox Add-ons (AMO).

## Usage

1. Open a conversation in [Bale Web](https://web.bale.ai/).
2. Open CipherGap's **Security** page and choose **Set up secure chat**.
3. The other participant opens CipherGap and accepts the incoming request.
4. Compare the six-digit verification code over a trusted channel, then mark the key verified.
5. Use the injected **Encrypt** button to send an encrypted message. Attachments are encrypted as `.cgpe` files when the chat key is available.

A manually shared key is available under **Settings → Advanced**, but it remains marked unverified.

Open **Files → Choose secure files**, or use **Secure files** above Bale's composer.
Select files and confirm Bale's preview, which contains encrypted `.cgpe` files.
The receiver can click **Decrypt & download** on the attachment. Enable
**Files → Receive files automatically** separately in each chat to download and
decrypt newly received attachments while that conversation is open. Previously
received files require a click; opening a chat does not download its history.
The original filename is retained. If direct download is unavailable, download
the `.cgpe` through Bale and use **Choose downloaded file instead**.

## Tech Stack

* JavaScript
* HTML/CSS
* WebExtensions API (Manifest V3 for Chrome and Firefox)
* AES Encryption

## Architecture

Messenger-independent code lives in `CipherGap/share/`. It is the single source
of truth for message and key-exchange formats, AES/ECDH utilities, the CGPE file
container, storage-key names, and adapter registration. Bale-specific selectors,
DOM observers, composer behavior, and rendering stay in `CipherGap/content/bale.js`.

Bale integration uses stable composer/scroller IDs, accessible labels, message
metadata and structural attachment children, without generated Bale class names.
The small MAIN-world bridge observes native Blob downloads and transfers only
the requested encrypted container to the isolated content script. Keys and
decrypted bytes stay outside the page's JavaScript context. Message drafts are
preserved during key exchange, and asynchronous sends are bound to their chat.

Future Eitaa, Rubika, Telegram and WhatsApp integrations should implement the messenger
adapter contract documented in `CipherGap/share/README.md`; they must not copy
encryption or packet-format code. Format upgrades add a new immutable codec and
keep old readers registered, so existing messages and files remain compatible.

## Security

* Encryption and decryption occur entirely on the client side.
* Incoming key exchanges require explicit approval and remain unverified until the SAS codes are compared.
* Peer fingerprints are retained when a chat key is cleared so unexpected identity changes can still be detected.
* CGPE v1 processes complete files in memory and therefore applies a 100 MB safety limit.
* CipherGap has no backend; plaintext processing happens locally before ciphertext is sent through Bale.
* Source code is publicly available for review and auditing.

> CipherGap improves privacy on supported messaging platforms, but users should independently review the cryptographic implementation before relying on it for highly sensitive communications.

## Contributing

Run the regression checks with `node --test tests/*.test.js`.
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
