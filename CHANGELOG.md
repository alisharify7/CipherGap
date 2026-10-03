# Changelog

## [1.2.0] - 2026-10-03

### Added

- Persian/English language selection with saved preference, RTL/LTR and local Vazirmatn/Inter fonts.
- Global and per-chat pause controls that preserve saved keys.
- A bilingual website on `website` with installation, verification and file tutorials.
- One shared Chrome/Firefox source with reproducible target-specific packages.
- Regression checks for plaintext/encrypted file choice, pause during selection, package identity and real isolated browser workflows.

### Changed

- Ordinary Bale attachments stay ordinary. Encrypted file selection is explicit and fails closed if the chat, key or enabled state changes.
- Composer controls use a compact, subdued teal style and include per-chat pause.
- Firefox desktop minimum is 140; TypedArray species and cross-realm ArrayBuffer handling work with Firefox content-script Xrays.
- CGP/CGPE v1 and existing saved keys remain compatible.


## [1.1.0](docs/releases/v1.1.0.md) — 2026-10-03

### Added

- A messenger-independent CipherGap logo, toolbar icons and popup branding.
- WhatsApp in the planned integrations alongside Eitaa, Rubika and Telegram.
- Redesigned Security, Files, Settings and Guide pages with light/dark themes
  and keyboard navigation.
- Security status and a secure file picker inside Bale's composer.
- Direct encrypted attachment download and local decryption, including cached
  files, with the downloaded-file picker retained as a fallback.
- Optional automatic download/decryption of new incoming attachments per chat.
- UI previews, a two-account browser validation record, and workflow regression tests.

### Fixed

- Key-exchange messages preserve existing and newly typed composer drafts.
- Asynchronous message sends, file uploads and downloads stay bound to their
  original chat and stop when the active conversation changes.
- Reload cleanup releases this tab's abandoned outgoing key exchange without
  cancelling another tab's live exchange.
- Bale attachment controls use semantic attributes and structural children
  instead of generated Bale CSS class names.
- Queued incoming requests are reconsidered after earlier requests are dismissed;
  expired exchange messages do not reopen old consent prompts.

### Changed

- Replaced the unused broad network bridge with a narrow native Blob download
  bridge that transfers only the requested encrypted container.
- Raised the minimum Firefox version to 128 for MAIN-world content script support.
- Existing CGP/CGPE v1 formats and per-chat storage names remain compatible.

Validation: all 22 automated tests and JavaScript syntax checks passed. Live
Chrome testing covered two-way ECDH/SAS, encrypted messages, direct cached-file
download and automatic file receipt in both directions, with exact byte comparisons.
