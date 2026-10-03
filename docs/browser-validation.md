# Bale browser validation

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
- Firefox 128+ is declared for MAIN-world support; Firefox was not tested live.
- Ordinary Bale text sending remains ordinary text; use CipherGap's Encrypt
  control when encryption is intended.
- SAS testing verifies the workflow. Real users must compare codes through a
  trusted channel to establish identity.
