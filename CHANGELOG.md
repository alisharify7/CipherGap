# Changelog

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
