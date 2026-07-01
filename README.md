# CipherGap 🔒

**CipherGap** is an open-source Chrome extension that adds client-side encryption to popular Iranian web messengers, including **Eitaa**, **Rubika**, and **Bale**.

Messages are encrypted locally in your browser before being sent, ensuring that only users with the shared secret can read the original content.

## Features

* 🔐 Client-side message encryption
* ⚡ AES-based symmetric cryptography
* 🌐 Supports Eitaa, Rubika, and Bale Web
* 🧩 Lightweight Chrome Extension (Manifest V3)
* 🔍 Fully open source and auditable
* 🚫 No external servers or cloud processing

## Installation

### Manual Installation

```bash
git clone https://github.com/alisharify7/CipherGap.git
```

1. Open `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the cloned `CipherGap` directory

The extension is now ready to use.

## Usage

1. Open Eitaa, Rubika, or Bale Web.
2. Click the CipherGap extension icon.
3. Enter or configure a shared encryption key.
4. Send encrypted messages normally.
5. Recipients using the same key can decrypt and read the messages.

## Tech Stack

* JavaScript
* HTML/CSS
* Chrome Extensions API (Manifest V3)
* AES Encryption

## Security

* Encryption and decryption occur entirely on the client side.
* No message content is transmitted to third-party services.
* Source code is publicly available for review and auditing.

> CipherGap improves privacy on supported messaging platforms, but users should independently review the cryptographic implementation before relying on it for highly sensitive communications.

## Contributing

Contributions, bug reports, and feature requests are welcome.

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

Released under the MIT License.

---

⭐ If you find CipherGap useful, consider starring the repository.


# Demo
### Extension Main Panel
<img src="./docs/index.png">

### Exchange Key using diffie hellman
<img src="./docs/1.png">
<img src="./docs/2.png">

### Verify the key
<img src="./docs/2.png">
