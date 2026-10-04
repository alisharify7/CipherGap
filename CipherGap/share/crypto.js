
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

async function derive_ciphergap_message_key(password) {
    return derive_aes_key_for_profile(
        password,
        get_ciphergap_message_crypto_profile()
    );
}

// Backward-compatible alias used by file encryption and existing call sites.
// There is intentionally only one key-derivation implementation.
async function derive_aes_key(password) {
    return derive_ciphergap_message_key(password);
}

async function encrypt_message(
    message,
    password,
    cachedCryptoKey = null,
    config = get_ciphergap_message_crypto_profile()
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
    config = get_ciphergap_message_crypto_profile()
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

globalThis.CipherGapShared.crypto = Object.freeze({
    get_message_crypto_profile: get_ciphergap_message_crypto_profile,
    derive_aes_key_for_profile,
    derive_aes_key,
    derive_ciphergap_message_key,
    encrypt_message,
    decrypt_message
});
