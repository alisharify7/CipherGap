
// Shared AES-256-GCM message encryption.

function get_ciphergap_message_crypto_profile(codecOrId = null) {
    const formats = globalThis.CipherGapShared.formats;
    const codecId = codecOrId
        ? (typeof codecOrId === "string" ? codecOrId : codecOrId.id)
        : formats.message.write_codec;
    const messageCodec = formats.message.codecs[codecId];
    return messageCodec
        ? formats.crypto.profiles[messageCodec.crypto_profile] ?? null
        : null;
}

async function derive_aes_key_for_profile(password, config) {
    const passwordHash = await crypto.subtle.digest(
        config.hash_algorithm,
        globalThis.CipherGapShared.encoding.encode_utf8(password)
    );

    return crypto.subtle.importKey(
        "raw",
        passwordHash,
        { name: config.aes_algorithm },
        false,
        ["encrypt", "decrypt"]
    );
}

// Returns an opaque key ring (see keyring.js) for the chat secret. It replaces
// the single CryptoKey of version 1; callers just pass it back unchanged.
async function derive_ciphergap_message_key(password) {
    return globalThis.CipherGapShared.keyring.open(password);
}

// Backward-compatible alias used by file encryption and existing call sites.
// There is intentionally only one key-derivation implementation.
async function derive_aes_key(password) {
    return derive_aes_key_for_profile(
        password,
        globalThis.CipherGapShared.formats.crypto.profiles.aes_gcm_sha256_v1
    );
}

// Version 1 (legacy). New messages use seal_message().
async function encrypt_message(
    message,
    password,
    cachedCryptoKey = null,
    config = globalThis.CipherGapShared.formats.crypto.profiles.aes_gcm_sha256_v1
) {
    const cryptoKey = cachedCryptoKey ?? await derive_aes_key_for_profile(
        password,
        config
    );
    const iv = crypto.getRandomValues(new Uint8Array(config.iv_bytes));

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: config.aes_algorithm, iv },
        cryptoKey,
        globalThis.CipherGapShared.encoding.encode_utf8(message)
    );

    return globalThis.CipherGapShared.encoding.bytes_to_base64(
        globalThis.CipherGapShared.encoding.concat_bytes(iv, encryptedBuffer)
    );
}

async function decrypt_message(
    encryptedMessage,
    password,
    cachedCryptoKey = null,
    config = globalThis.CipherGapShared.formats.crypto.profiles.aes_gcm_sha256_v1
) {
    const cryptoKey = cachedCryptoKey ?? await derive_aes_key_for_profile(
        password,
        config
    );
    const combined = globalThis.CipherGapShared.encoding
        .base64_to_bytes(encryptedMessage);
    // Buffer views avoid TypedArray species lookups across Firefox's Xrays.
    const iv = new Uint8Array(combined.buffer, combined.byteOffset, config.iv_bytes);
    const encryptedData = new Uint8Array(combined.buffer, combined.byteOffset + config.iv_bytes, combined.byteLength - config.iv_bytes);

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: config.aes_algorithm, iv },
        cryptoKey,
        encryptedData
    );

    return globalThis.CipherGapShared.encoding.decode_utf8(decryptedBuffer);
}

// =========================
// Version 2 messages
// =========================
//
// Packet:  CGP|2|AESGCMHKDF|<unix seconds>|base64(iv || ciphertext)
// Key:     message key of the UTC-day epoch derived from the timestamp
// AAD:     "CGP|2|AESGCMHKDF|<timestamp>|msg"  (header cannot be altered)
// Plain:   0x00 text                                   (ordinary message)
//          0x01 expiresAtMs(u64) viewSeconds(u16) text (self-destructing)

const V2_PURPOSE_MESSAGE = "msg";
const V2_KIND_TEXT = 0;
const V2_KIND_TIMED = 1;
const V2_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function v2_aad(codec, timestamp, purpose) {
    return globalThis.CipherGapShared.encoding.encode_utf8(
        [codec.prefix, codec.version, codec.algorithm, timestamp, purpose].join(codec.separator)
    );
}

function encode_v2_body(text, options = {}) {
    const textBytes = globalThis.CipherGapShared.encoding.encode_utf8(text);
    const expiresAt = Number(options.expiresAt) || 0;
    const viewSeconds = Number(options.viewSeconds) || 0;
    if (!expiresAt && !viewSeconds) {
        const body = new Uint8Array(1 + textBytes.length);
        body[0] = V2_KIND_TEXT;
        body.set(textBytes, 1);
        return body;
    }
    if (!Number.isSafeInteger(expiresAt) || expiresAt < 0 ||
        !Number.isInteger(viewSeconds) || viewSeconds < 0 || viewSeconds > 0xFFFF) {
        throw new Error("Invalid self-destruct settings.");
    }
    const body = new Uint8Array(1 + 8 + 2 + textBytes.length);
    const view = new DataView(body.buffer);
    body[0] = V2_KIND_TIMED;
    view.setUint32(1, Math.floor(expiresAt / 2 ** 32));
    view.setUint32(5, expiresAt >>> 0);
    view.setUint16(9, viewSeconds);
    body.set(textBytes, 11);
    return body;
}

function decode_v2_body(bytes) {
    const encoding = globalThis.CipherGapShared.encoding;
    if (bytes.length >= 1 && bytes[0] === V2_KIND_TEXT) {
        return { text: encoding.decode_utf8(bytes.subarray(1)), expiresAt: 0, viewSeconds: 0 };
    }
    if (bytes.length >= 11 && bytes[0] === V2_KIND_TIMED) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return {
            text: encoding.decode_utf8(bytes.subarray(11)),
            expiresAt: view.getUint32(1) * 2 ** 32 + view.getUint32(5),
            viewSeconds: view.getUint16(9)
        };
    }
    throw new Error("This message uses a newer CipherGap feature. Update CipherGap to read it.");
}

function check_v2_epoch(epoch) {
    const profile = globalThis.CipherGapShared.formats.crypto.profiles.hkdf_aes_gcm_v2;
    const current = globalThis.CipherGapShared.keyring.now_epoch();
    if (!Number.isInteger(epoch) || epoch < 0) {
        const error = new Error("This message has an invalid timestamp.");
        error.code = "BAD_EPOCH";
        throw error;
    }
    if (epoch > current + profile.max_future_epochs) {
        const error = new Error("This message is dated too far in the future. Check your device clock.");
        error.code = "BAD_EPOCH";
        throw error;
    }
}

// Encrypts `text` and returns the complete wire packet (with install notice).
async function seal_message(text, secret, ring = null, options = {}) {
    const shared = globalThis.CipherGapShared;
    const codec = shared.formats.message.codecs[options.codecId ?? "cgp_v2"];
    const profile = shared.formats.crypto.profiles[codec.crypto_profile];
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
    ring ??= await shared.keyring.open(secret);
    const epoch = shared.keyring.epoch_of(timestamp);
    check_v2_epoch(epoch);
    const key = await ring.message_key(epoch);
    const iv = crypto.getRandomValues(new Uint8Array(profile.iv_bytes));
    const sealed = await crypto.subtle.encrypt(
        { name: profile.aes_algorithm, iv, additionalData: v2_aad(codec, timestamp, V2_PURPOSE_MESSAGE) },
        key,
        encode_v2_body(text, options)
    );
    const data = shared.encoding.bytes_to_base64(shared.encoding.concat_bytes(iv, sealed));
    return shared.protocol.build_ciphergap_packet(data, timestamp, codec.id);
}

// Decrypts a wire packet of any supported version.
// Returns { text, expiresAt, viewSeconds, id, version }.
async function open_message(packetText, secret, ring = null) {
    const shared = globalThis.CipherGapShared;
    const parsed = shared.protocol.parse_ciphergap_packet(packetText);
    if (!parsed?.data) throw new Error("Invalid CipherGap packet format.");
    const codec = shared.protocol.get_ciphergap_packet_codec(parsed);
    if (!codec) throw new Error("This CipherGap message uses an unsupported version or algorithm.");
    ring ??= await shared.keyring.open(secret);
    const profile = shared.formats.crypto.profiles[codec.crypto_profile];
    const id = parsed.data.slice(0, 16);

    if (codec.version === "1") {
        const text = await decrypt_message(parsed.data, secret, await ring.legacy_key(), profile);
        return { text, expiresAt: 0, viewSeconds: 0, id, version: 1 };
    }

    if (!/^\d{9,11}$/.test(parsed.timestamp)) throw new Error("This message has an invalid timestamp.");
    const timestamp = Number(parsed.timestamp);
    const epoch = shared.keyring.epoch_of(timestamp);
    check_v2_epoch(epoch);
    const combined = shared.encoding.base64_to_bytes(parsed.data);
    if (combined.length < profile.iv_bytes + profile.gcm_tag_bytes + 1) throw new Error("Invalid CipherGap packet format.");
    const iv = new Uint8Array(combined.buffer, combined.byteOffset, profile.iv_bytes);
    const ciphertext = new Uint8Array(combined.buffer, combined.byteOffset + profile.iv_bytes, combined.byteLength - profile.iv_bytes);
    const key = await ring.message_key(epoch);
    let plaintext;
    try {
        plaintext = await crypto.subtle.decrypt(
            { name: profile.aes_algorithm, iv, additionalData: v2_aad(codec, parsed.timestamp, V2_PURPOSE_MESSAGE) },
            key,
            ciphertext
        );
    } catch {
        const error = new Error("Wrong key, or the message was modified.");
        error.code = "AUTH_FAILED";
        throw error;
    }
    return { ...decode_v2_body(new Uint8Array(plaintext)), id, version: 2 };
}

globalThis.CipherGapShared.crypto = Object.freeze({
    seal_message,
    open_message,
    max_ttl_ms: V2_MAX_TTL_MS,
    get_message_crypto_profile: get_ciphergap_message_crypto_profile,
    derive_aes_key_for_profile,
    derive_aes_key,
    derive_ciphergap_message_key,
    encrypt_message,
    decrypt_message
});
