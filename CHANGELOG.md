# Changelog

## Unreleased

- Group management: the creator can remove a member or rotate the group key. Everyone else receives the new key in the chat (no re-joining); the removed member keeps old messages but cannot read new ones. Older messages stay readable through previous keys, which follow the same retention window. Optional member names are stored locally.
- Group membership records and previous keys are encrypted at rest by the app lock.
- Key lifecycle in the popup: key type, when the key was saved, how far back messages are readable, and verification.
- Optional "Review before sending" shows your message and the ciphertext before each encrypted send.
- Search decrypted messages loaded in the open chat, with next/previous match.
- The passphrase app lock is browser-only (hidden on Android).

## [1.8.0](docs/releases/v1.8.0.md) - 2026-11-22

- New message format `CGP|2` (HKDF-SHA256 key schedule, AES-256-GCM with authenticated header). Version 1 messages still open with keys that were not ratcheted. **Both people must update**: older versions cannot read version 2.
- Forward secrecy: new chat keys are a daily symmetric ratchet. Keys older than a retention window (default 7 days, configurable 1-90) are deleted, so a stolen key cannot open older messages. Existing chats can opt in from Settings.
- Typed passphrases are stretched with PBKDF2-SHA256 (600,000 iterations); random 32-byte keys use HKDF directly.
- Message headers and file headers (name, type, epoch) are authenticated with AES-GCM additional data. CGPE files use container version 2; version 1 files still open.
- Self-destructing messages: per-chat timer (5 min, 1 h, 24 h, 7 days) or burn after reading (30 s after opening). Enforced by CipherGap on each device; it cannot stop screenshots or copies.
- Optional app lock: chat keys are encrypted at rest with a passphrase, auto-lock after inactivity and when the browser closes, throttled unlock attempts.
- Secure group chats: the creator publishes an invitation in the group; members join with one click and the creator approves each person, which delivers the group key sealed to that member only (ECDH + AES-GCM). Works with forward secrecy and self-destruct. Members see each other's fingerprints; approve only people you recognise.
- Tests: `tests/browser_group.py`, `tests/crypto_v2.test.js`, `tests/browser_v2_features.py`.

## [Android 0.1.4](docs/releases/android-v0.1.4.md) - 2026-10-08

- Enable Rubika and Soroush Plus on Android using the existing shared adapters.
- Derive Android launcher URLs, native origins and injection paths from the extension manifest.
- Restore the shared emoji/sticker picker on Android, including native textarea emoji insertion.
- Wait for native draft clearing even when the messenger normalizes whitespace.
- Fix Android CSS bundling so shared dialog/theme styles and touch targets are applied.
- Synchronize and build the Android core when main changes; retain a single shared feature implementation.

## [1.7.0](docs/releases/v1.7.0.md) - 2026-10-07

- Fixed Eitaa chat detection for both numeric IDs and `@username` URL hashes.
- Added encrypted full/chat backups, reviewed imports and exact UTF-8 key transfer.
- Added offline key QR generation, image reading and camera scanning.
- Clarified five popup tabs with shared Persian/English and light/dark controls.
- Added the optional Coffeete support link.


## [1.6.1](docs/releases/v1.6.1.md) - 2026-10-06

- Moved Bale desktop controls out of the native composer into an aligned floating toolbar.
- Kept the encrypted send action separate from Bale’s ordinary send and voice controls.
- Added narrow/wide native-layout regressions and retained Chrome/Firefox messaging and file coverage.

## [1.6.0](docs/releases/v1.6.0.md) - 2026-10-05

- Added desktop adapters for Rubika Web and Soroush Plus Web using the shared encryption, exchange and media core.
- Aligned floating controls with the native message box instead of its wider send-button row.
- Synchronized Rubika drafts through native key events and selected its actual send handler.
- Deferred Soroush message controls until its native send commit completes.
- Resolved live attachment-menu items after rendering, including untranslated native labels.
- Added Chromium and Firefox native DOM regressions for key exchange, expiry, emoji, files, media and pause.

## Unreleased — shared mobile compatibility - 2026-10-05

- Kept the same core in Chrome, Firefox and Android: optional platform hooks
  adapt downloads, localization, notifications and mobile control placement.
- Detect the messenger independently of transient editor replacements.
- Support native text-field drafts and delayed send controls/draft clearing.
- Preserve failed drafts, validate the chat while waiting and click send once.
- Correct generic Persian guidance and localize mobile sending errors.
- Shared Node (35), Chrome/Firefox messenger and Android/desktop checks passed.

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
