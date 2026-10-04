# CipherGap shared core

This directory is the messenger-independent source of truth. Bale, Eitaa,
Rubika, Telegram, and future adapters must call these utilities instead of
defining their own CipherGap formats or cryptography.

There is no bundler in this project. The files are classic scripts loaded in
manifest order and publish a documented facade on `globalThis.CipherGapShared`.
The old global function names are kept for the current runtime while adapters
are migrated incrementally.

## Modules

- `namespace.js` creates the shared facade.
- `config.js` owns protocol versions, markers, algorithms, sizes, timeouts, and
  storage-key factories plus the popup's supported-messenger metadata.
- `encoding.js` owns UTF-8, Base64, byte concatenation, and hexadecimal helpers.
- `protocol.js` builds and parses CGP, exchange start/ACK, and SAS messages. It
  also owns strict validation and display formatting for protocol identifiers.
- `crypto.js` owns the single SHA-256 → AES-GCM key derivation and message
  encryption/decryption implementation.
- `file_crypto.js` owns the CGPE container and file encryption/decryption.
- `dh_crypto.js` owns P-256 ECDH, shared-secret derivation, SAS, and fingerprints.
- `messenger_adapter.js` owns adapter registration and chat-context resolution.
- `file_viewer.js` / `.css` own a native accessible dialog, raster image previews,
  audio/video controls, safe MIME normalization, original downloads and Blob URL cleanup.
- `exchange_ui.js` / `.css` own exchange/SAS cards, inline consent and countdowns.
- `theme.css` supplies shared Radix Indigo/Slate color tokens to the popup, chat UI and website.
- `i18n.js` / `translations.js` localize only CipherGap UI, preserving filenames marked `translate="no"`.

## Adapter boundary

A messenger adapter may:

- identify its hostname and stable chat ID;
- locate the composer, send control, messages, and attachments;
- send text through the messenger;
- observe SPA/DOM changes;
- render CipherGap controls next to messenger content.

An adapter must not contain literals such as `CGP`, `CGPE`, `AESGCM`,
`start exchange key:`, or `cg-sas`. It should pass extracted text to
`CipherGapShared.protocol` and use `CipherGapShared.crypto`,
`CipherGapShared.file_crypto`, and the shared storage-key factories.

The current adapter interface is:

```js
register_messenger_adapter("example", {
    hostnames: ["web.example.test"],
    is_active() {},
    is_in_chat(url) {},
    get_chat_storage_suffix(url) {},
    send_message(text) {},
    extract_message_text(element) {},
    inject_ui() {},
    observe_messages() {},
    auto_decrypt_visible_messages() {},
    clear_input() {} // optional
});
```

All methods above except `clear_input` are required and validated during
registration. The shared runtime routes popup actions such as auto-decrypt to
the active adapter, so a new adapter does not need a second popup listener.

Add the messenger metadata (`id`, display name, and hostnames) to
`share/config.js` as well as registering its adapter. The popup uses this
metadata before asking the content script for the authoritative chat context.
Its compatibility list and roadmap are rendered from that same configuration,
so adapter files must not add messenger-specific popup branches.
The adapter hostnames, config hostnames, and explicit manifest matches must
agree.

Keep the suffix stable and opaque. The shared resolver produces
`<hostname>_<suffix>`, preserving existing Bale keys such as
`web.bale.ai_49589703`.

## Changing a format

Add an immutable codec entry under `formats.<type>.codecs` in `config.js`, then
point that type's `write_codec` at the new entry. Never edit or remove an old
codec merely to change what is written: the codec registry is also the reader
registry. Keep CGP v1, CGPE v1, their crypto profile, and the legacy exchange
strings readable. Every exchange codec must name both its ECDH derivation
profile and the message codec used for encrypted confirmations. The exchange
controller carries the matched codec ID through pending and stored state so a
legacy request receives a legacy ACK, SAS, and confirmation. Update
`tests/shared_core.test.js` with fixed old and new golden vectors.

Messenger host permissions and content-script matches remain explicit Chrome
manifest entries. Add them only when that messenger has a tested adapter.

## Reusing presentation

After an adapter obtains a CGPE container, call the shared `file_crypto.decrypt_file`
with the active chat key, then `file_viewer.open({name, type, data})`. The viewer
handles preview, native playback and Download. For opt-in automatic saving use
`file_viewer.download` instead. Close the viewer on pause, chat changes or key
changes. No adapter should duplicate MIME routing, object URL cleanup or decryption.
HTML/SVG and unknown formats are downloads only. Full authentication precedes
playback; CGPE v1 does not stream ciphertext over the network into a player.

Use `exchange_ui.create_request(parsed, signature, options)` or `create_code`
and mount the result inside a native message. Set `ciphergapStorageKey`,
`ciphergapNonce` and `ciphergapExpiresAt` on its dataset; attach a timer with
class `ciphergap-chat-card__timer`. The adapter supplies `readState`, `onRespond`,
`onError` and `onUpdate` callbacks. Call `exchange_ui.update(cards, state)` once
per second with `{storageKey, enabled, status}`. The shared controller separately
checks expiry before ACK, key storage and SAS verification, so UI timers cannot
extend a deadline. Start, ACK and SAS carry the same Unix millisecond deadline;
legacy requests require the original messenger sending timestamp. Both peers
must update to 1.3.0 for timed exchange messages. CGP/CGPE encryption and old
message/file readers are unchanged.

## Chat DOM modules

`content/chat_runtime.js` owns message observers, draft preservation, consent cards, pause state, native file handoff and media mounting. `content/bale.js`, `content/eitaa.js` and `content/telegram.js` describe only each messenger’s DOM and native controls. Register the messenger in `share/config.js`, add its explicit hosts/paths to both content-script matches, and load its platform module before the runtime. Use semantic IDs/roles/data attributes or structural children; never select generated messenger classes. Platform adapters dispatch the same shared crypto/protocol operations.

Key storage is scoped by hostname and numeric conversation ID. Telegram support is limited to Web A (`/a/`); Web K has no injected scripts. A new codec must retain legacy readers and pass shared compatibility vectors before release.
