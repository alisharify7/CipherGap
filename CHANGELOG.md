# Changelog

## [1.5.0](docs/releases/v1.5.0.md) - 2026-10-04

### Added

- An explicit emoji/sticker picker with built-in PNG stickers and imported PNG/JPEG/WebP/GIF/AVIF/WebM up to 5 MB.
- Authenticated sticker purpose, name and type inside the shared CGPE body; inline display, native animated playback and original downloads.
- Chrome/Firefox regressions for native Unicode emoji, sticker uploads, playback, exact downloads, quote selection and message dimensions.

### Fixed

- Telegram bubbles retain natural width while decrypting, after delivery and on window resize.
- Native file previews work with a floating toolbar outside Teact's composer subtree.
- Opened stickers and their download controls stay above the Eitaa toolbar after responsive native scroll anchoring.
- Eitaa decrypts the actual message instead of a quoted older packet; encrypted quote previews stay compact.
- Pause and key changes clear decrypted message/sticker views and restore original ciphertext.
- Firefox sticker decoding avoids Xray-protected TypedArray constructor access.

### Changed

- Compact themed chat controls, icon actions, short encrypted-message cards and an expandable file fallback.
- Both participants need 1.5.0 for inline stickers; the cipher, saved keys, text packets and normal file format are unchanged. Native sticker menus remain ordinary.

## [1.4.0](docs/releases/v1.4.0.md) - 2026-10-04

### Added

- Eitaa Web and Telegram Web A integrations, using the same crypto, key exchange, media viewer, language and pause controls as Bale.
- Small platform modules over one shared chat lifecycle and file handoff.
- Secure uploads through native document previews, including Telegram’s detached file input.
- Eitaa ciphertext-cache receipt and bounded native Service Worker download handling.
- Two-party browser fixtures for both new messengers in Chrome and Firefox.

### Fixed
- Localized Persian/Arabic wire digits are restored for parsing without changing plaintext.
- Returning quickly to a chat refreshes invalidated key state; abandoned encrypted selections never reach the host.
- Telegram’s delayed native ciphertext download is suppressed once after opening the local viewer.

- Preserve native timestamps outside protocol and decrypted message content.
- Preserve drafts when the native messenger does not accept a send.
- Hide Telegram installation-link previews while CipherGap is enabled.
- Reserve space for chat controls instead of covering the last message.
- Stop secure selections after navigating out of a chat.


## [1.3.0](docs/releases/v1.3.0.md) - 2026-10-04

### Added

- Shared image viewer and native audio/video players with original-file downloads.
- In-chat exchange acceptance/decline, explicit key replacement confirmation and a countdown.
- A 15-minute absolute request/SAS deadline, enforced before ACK, key storage and verification.
- GitHub Pages alongside GitHub in the hidden installation footer.
- Shared Radix Indigo/Slate theme and browser-first bilingual installation guide.

### Fixed

- Firefox/Linux WAV MIME aliases now open in Chrome’s audio player.
- Firefox popup sizing, passive toast click interception and SAS countdown deadline retention.
- Closing or pausing previews releases Blob URLs and stops playback.

### Compatibility

- Update both participants to 1.3.0 for timed exchanges and the two-link footer.
- Existing AES-GCM messages, CGPE files and saved keys remain readable.
- Preview authenticates the complete file before playback; CGPE v1 retains its 100 MB limit.

## [1.2.1](docs/releases/v1.2.1.md) - 2026-10-04

### Added

- Encrypted messages include a Persian installation guide and the GitHub link for recipients without CipherGap.
- Enabled readers hide the guide before or after decryption, including split paragraphs and linked URLs; pausing the extension restores it.
- Regression coverage for notice-bearing encryption, legacy messages, browser rendering and pause/resume.

### Compatibility

- The AES-GCM payload, CGP v1 fields and saved keys are unchanged. Version 1.2.1 still reads older messages.
- Both participants should update to 1.2.1 to read messages with the new installation guide; older readers do not understand the appended text.

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
