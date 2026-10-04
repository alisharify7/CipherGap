# Browser validation

## 1.5.0 — 2026-10-04

Live checks used the same logged-in **Your Chrome / Default** profile and
Saved Messages URLs below. Existing test keys were retained.

- Sent and decrypted `CipherGap 1.5 · سلام 👨‍👩‍👧‍👦` followed by `👍🏽 ❤️` on
  both platforms. Telegram text kept a natural width (about 170 CSS px) and two
  lines, including after closing DevTools/resizing and final delivery.
- The initial live check exposed a pending Telegram bubble acquiring
  `contain: inline-size` after delivery; owned message ancestors now prevent that
  collapse throughout the transition.
- A built-in PNG emoji sticker was encrypted, confirmed in the native preview,
  sent, authenticated and shown inline on both services (256-pixel original,
  220 CSS px preview). Telegram's native document icon/size are hidden for this
  view; native timestamps remain visible. Test messages/stickers remain there.
- Moving the floating toolbar outside Teact's composer restored its native file
  preview. The toolbar was visually checked in the actual dark interfaces.
- Eitaa's selected reply target revealed that quoted older ciphertext could be
  chosen ahead of the actual body. Native timestamp anchoring now decrypts the
  correct message; quote previews use a compact encrypted-message label.

Isolated **Chrome and Firefox ESR 153.4.0** integration tests on both messenger
origins cover two-party ECDH/SAS, native image-backed Unicode emoji and joined
sequences, ciphertext-only sticker upload, inline PNG and WebM playback, larger
image viewing, exact PNG downloads, pause cleanup, native timestamps and reply
selection. Chrome also checks compact controls at 390 px, dynamic containment,
request expiry, abandoned secure picks and native composer-overlap/scroll-anchor recovery. Existing Bale flows pass in both
browsers. All 34 Node checks pass, including authenticated sticker metadata,
tamper/wrong-key rejection, passive MIME/size validation and legacy vectors.

Live sticker checks were self-chat PNG tests in Chrome. Firefox Eitaa/Telegram
and animated WebM checks used isolated profiles and sanitized DOM fixtures;
no second live Eitaa/Telegram account was used. Native sticker packs, TGS/Lottie,
Android and slow near-limit live transfers remain outside this validation.

## 1.4.0 — 2026-10-04

The unpacked extension was installed and tested in the user's logged-in Chrome
**Your Chrome / Default** profile at `https://web.eitaa.com/#70024058` and
`https://web.telegram.org/a/#5793551013`. Both URLs opened **Saved Messages** in
these accounts. Live checks therefore used self chats, not a second person.

- Encrypted English/Persian messages were sent through each native composer,
  persisted in the messenger, and decrypted to the exact original text.
- A PNG was encrypted through the dedicated picker on each platform. The native
  upload confirmation contained only a `.cgpe` container; the file was sent.
- Each received attachment opened in CipherGap's image viewer. Downloads matched
  the original PNG byte for byte. Eitaa also passed a cold-cache download after
  clearing only that test document's ciphertext cache entry and reloading.
- Telegram's installation-link preview and footer are hidden while enabled.
  The toolbar reserves space above the native composer rather than covering the
  last message. These changes were checked in the actual chat DOM and visually.
- Test keys were created only for these previously empty self-chat slots and are
  explicitly **unverified**. Test messages/files remain readable there.

Separate isolated Chrome and Firefox ESR **153.4.0** profiles run the actual
extension against sanitized native DOM contracts for two distinct chat IDs on
both platforms. They check two-party ECDH, matching keys/SAS, inline acceptance,
verified trust, encrypted text, native upload handoff (including Telegram's
otherwise detached input), image preview, WAV/WebM playback, safe HTML fallback,
exact manual/automatic original downloads, history/outgoing exclusion and pause.
Chrome also checks request expiry and abandoning a secure picker during chat
navigation. These
fixtures do not log into accounts or send messages to the live services.
The existing Bale browser checks still pass in both browsers. All 31 Node
regressions, the package identity check, Firefox lint (zero warnings/errors),
JavaScript syntax checks and the responsive bilingual website checks pass.

Protocol regressions cover Persian/Arabic digit localization without changing
original plaintext. The shared crypto formats and legacy vectors are unchanged.
Telegram Web K, username-only URLs, Android, host interface languages other than
English/Persian, and slow near-100-MB live transfers were not validated.

## 1.3.0 — 2026-10-04

Tested in the user's logged-in Chrome **ahmad** profile at
`https://web.bale.ai/chat?uid=1195997823` and Firefox ESR **153.4.0** at
`https://web.bale.ai/chat?uid=49589703`. Chrome loaded the unpacked checkout;
Firefox loaded a temporary generated Firefox package. Both remained logged in.

- A fresh Chrome request was accepted in Firefox's chat card. Existing-key
  replacement showed the inline confirmation before acceptance. Both sides
  displayed matching six-digit SAS and were verified.
- Firefox sent encrypted Persian text; Chrome displayed its plaintext and hid
  both installation links. Encrypted verification confirmations were decrypted.
- Each browser sent PNG, WAV and WebM through the explicit encrypted picker.
  Bale's upload confirmation contained three `.cgpe` files on both browsers.
- Firefox manually opened all three Chrome attachments: image preview, audio
  playback and video playback. Its Download results matched the originals.
- Chrome automatically saved the incoming Firefox attachments, then manually
  previewed the image and played audio/video. Downloaded bytes matched originals.
  Chrome requested its native permission for multiple automatic downloads.
- The live test exposed Firefox/Linux's `audio/vnd.wave` type, which is now
  normalized to WAV. It also exposed a SAS card losing its absolute deadline;
  strict parsing now retains that field, with a regression check.
- The actual Firefox popup was visually checked after fixing its width; it uses
  the same 440 × 590 layout as Chrome. Test attachments remain in the conversation.

Automated checks additionally cover an expired chat card (`00:00`, gray state,
accept hidden), late/altered ACKs, expiry before verification, persisted request
age, real media decoding, native downloads, HTML fallback without execution,
Blob revocation and pause closing a preview. All 30 Node regressions, the package
identity check, Chrome/Firefox browser flows and bilingual website checks passed.
The browser test profiles use synthetic Bale DOM fixtures and do not send live
messages; the account tests above were separate GUI runs.

## Earlier Chrome validation (1.1.0)


Validated on 2026-10-03 in the user's existing, logged-in Chrome profiles.
Both profiles loaded the unpacked extension from this checkout; the older
Downloads copy was disabled so two content scripts could not compete.

## Live results

| Workflow | Result |
| --- | --- |
| Default profile to ahmad: ECDH request and acceptance | Both sides displayed SAS `755126`; verified on both profiles |
| Encrypted confirmation | Delivered and decrypted on the peer |
| Persian/English encrypted text | Sent and automatically decrypted in both directions |
| File selection through Files page and in-chat Secure files | Native Bale preview contained `.cgpe`, before confirming upload |
| Incoming cached attachment: Decrypt & download | Original 2,240-byte text file saved; exact byte comparison passed |
| Default to ahmad: automatic attachment receipt | Original 65,536-byte binary file saved; exact byte comparison passed |
| ahmad to Default: automatic attachment receipt | Original 5,300-byte Persian text file saved; exact byte comparison passed |

Automatic message decryption and automatic file receipt were enabled for the
tested conversation on both profiles. The shared key remains verified there.
The test messages and encrypted attachments remain in that conversation.

## Automated validation

`node --test tests/*.test.js` covers wire-format compatibility, legacy message
and file vectors, AES authentication, matching ECDH/SAS, manifest ordering,
preserving drafts, aborting sends/downloads after a chat change, native cached
and uncached attachment controls, tab-specific reload cleanup, and bridge
filtering for filenames, normal blobs, byte limits and one-time download capture.
All 22 tests passed, including automatic receipt opt-in, history/outgoing exclusion
and duplicate-queue prevention.

The popup was also exercised in an isolated Playwright browser with mocked
extension APIs for no key, incoming request, waiting, SAS, changed identity and
verified states. Every security action remained within the 440 × 590 popup;
keyboard tab navigation, theme switching and missing-element errors were checked.
All extension JavaScript passed `node --check`.

## Current boundaries

- Automatic file receipt is opt-in per chat and covers new incoming attachments
  while that conversation is open. History and outgoing files require a click.
- CGPE v1 holds files in memory: 100 MB per received file and 100 MB combined
  per selection. The 100 MB boundary and slow-network transfers were not tested live.
- If Bale changes its semantic markup or download flow, the downloaded-file
  picker remains available. The bridge times out after 45 seconds.
- Firefox desktop 140+ is required; live Firefox 153.4.0 results appear above. Firefox Android remains untested.
- Ordinary Bale text sending remains ordinary text; use CipherGap's Encrypt
  control when encryption is intended.
- SAS testing verifies the workflow. Real users must compare codes through a
  trusted channel to establish identity.
