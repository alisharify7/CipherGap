// Shared CGPE file codec and AES-256-GCM file encryption.
// Uses the exact same key derivation as message encryption.
// Files are wrapped in a CGPE binary container so the receiver can
// identify and decrypt them.

const CGPE_FORMAT_REGISTRY = globalThis.CipherGapShared.formats.file;
const CGPE_WRITE_FORMAT = CGPE_FORMAT_REGISTRY.codecs[
    CGPE_FORMAT_REGISTRY.write_codec
];
const CGPE_CRYPTO_PROFILES = globalThis.CipherGapShared.formats.crypto.profiles;
const CGPE_WRITE_CRYPTO = CGPE_CRYPTO_PROFILES[
    CGPE_WRITE_FORMAT.crypto_profile
];
const CGPE_MAGIC = new Uint8Array(CGPE_WRITE_FORMAT.magic_bytes);
const CGPE_VERSION = CGPE_WRITE_FORMAT.version;
const CGPE_FILE_EXTENSION = CGPE_WRITE_FORMAT.extension;
// Version 1 encrypts whole files in memory. Keep a conservative ceiling so a
// large attachment cannot freeze or crash the messenger tab.
const CGPE_MAX_FILE_BYTES = CGPE_WRITE_FORMAT.max_file_bytes;
const CGPE_MAX_FILENAME_BYTES = CGPE_WRITE_FORMAT.max_filename_bytes;
const CGPE_MAX_MIME_BYTES = CGPE_WRITE_FORMAT.max_mime_bytes;
const CGPE_GCM_TAG_BYTES = CGPE_WRITE_CRYPTO.gcm_tag_bytes;
const CGPE_IV_BYTES = CGPE_WRITE_CRYPTO.iv_bytes;

function get_cgpe_formats() {
    return Object.values(CGPE_FORMAT_REGISTRY.codecs);
}

function get_cgpe_max_container_bytes_for_format(format) {
    const cryptoProfile = CGPE_CRYPTO_PROFILES[format.crypto_profile];
    return format.max_file_bytes + format.magic_bytes.length + 1 + 4 +
        format.max_filename_bytes + 4 + format.max_mime_bytes +
        cryptoProfile.iv_bytes + cryptoProfile.gcm_tag_bytes;
}

function get_cgpe_max_container_bytes() {
    return Math.max(
        ...get_cgpe_formats().map(get_cgpe_max_container_bytes_for_format)
    );
}

function get_cgpe_file_extensions() {
    return [...new Set(
        get_cgpe_formats().map((format) => format.extension.toLowerCase())
    )];
}

function get_cgpe_file_accept() {
    return [...get_cgpe_file_extensions(), "application/octet-stream"]
        .join(",");
}

function format_file_size_limit(byteCount) {
    const units = [
        [1024 ** 3, "GB"],
        [1024 ** 2, "MB"],
        [1024, "KB"]
    ];
    const [unitBytes, unitLabel] = units.find(
        ([candidateBytes]) => byteCount >= candidateBytes
    ) ?? [1, "bytes"];
    const value = byteCount / unitBytes;
    return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unitLabel}`;
}

function get_cgpe_write_file_size_label() {
    return format_file_size_limit(CGPE_WRITE_FORMAT.max_file_bytes);
}

function get_cgpe_max_file_size_label() {
    return format_file_size_limit(Math.max(
        ...get_cgpe_formats().map((format) => format.max_file_bytes)
    ));
}

function contains_cgpe_filename(value) {
    const normalized = String(value ?? "").toLowerCase();
    return get_cgpe_formats().some(
        (format) => normalized.includes(format.extension.toLowerCase())
    );
}

async function derive_cgpe_write_key(password) {
    return globalThis.CipherGapShared.crypto.derive_aes_key_for_profile(
        password,
        CGPE_WRITE_CRYPTO
    );
}

// =========================
// Encrypt file → CGPE binary blob
// =========================

async function encrypt_file(file, password, existingAesKey = null) {
    if (
        !file ||
        typeof file.arrayBuffer !== "function" ||
        !Number.isFinite(file.size)
    ) {
        throw new Error("No valid file was selected.");
    }
    if (file.size > CGPE_MAX_FILE_BYTES) {
        throw new Error(
            `This file is larger than CipherGap's ${get_cgpe_write_file_size_label()} safety limit.`
        );
    }

    const fileBuffer = await file.arrayBuffer();
    const aesKey = existingAesKey ?? await derive_cgpe_write_key(password);
    const iv = crypto.getRandomValues(new Uint8Array(CGPE_IV_BYTES));

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: CGPE_WRITE_CRYPTO.aes_algorithm, iv },
        aesKey,
        fileBuffer
    );

    // Encode original filename and MIME type as UTF-8
    const nameBytes = globalThis.CipherGapShared.encoding.encode_utf8(file.name);
    const mimeBytes = globalThis.CipherGapShared.encoding
        .encode_utf8(file.type || "application/octet-stream");

    if (nameBytes.length === 0 || nameBytes.length > CGPE_MAX_FILENAME_BYTES) {
        throw new Error("The selected file has an invalid or unusually long name.");
    }
    if (mimeBytes.length > CGPE_MAX_MIME_BYTES) {
        throw new Error("The selected file has an unusually long MIME type.");
    }

    const headerSize = CGPE_MAGIC.byteLength + 1 + 4 +
        nameBytes.length + 4 + mimeBytes.length;
    const totalSize = headerSize + CGPE_IV_BYTES + encryptedBuffer.byteLength;

    const cgpe = new Uint8Array(totalSize);
    let offset = 0;

    // Magic
    cgpe.set(CGPE_MAGIC, offset);
    offset += CGPE_MAGIC.byteLength;

    // Version
    cgpe[offset] = CGPE_VERSION;
    offset += 1;

    // Original filename length (uint32 LE)
    cgpe[offset] = nameBytes.length & 0xFF;
    cgpe[offset + 1] = (nameBytes.length >> 8) & 0xFF;
    cgpe[offset + 2] = (nameBytes.length >> 16) & 0xFF;
    cgpe[offset + 3] = (nameBytes.length >> 24) & 0xFF;
    offset += 4;

    // Original filename
    cgpe.set(nameBytes, offset);
    offset += nameBytes.length;

    // Original MIME type length (uint32 LE)
    cgpe[offset] = mimeBytes.length & 0xFF;
    cgpe[offset + 1] = (mimeBytes.length >> 8) & 0xFF;
    cgpe[offset + 2] = (mimeBytes.length >> 16) & 0xFF;
    cgpe[offset + 3] = (mimeBytes.length >> 24) & 0xFF;
    offset += 4;

    // Original MIME type
    cgpe.set(mimeBytes, offset);
    offset += mimeBytes.length;

    // IV
    cgpe.set(iv, offset);
    offset += CGPE_IV_BYTES;

    // Ciphertext
    cgpe.set(new Uint8Array(encryptedBuffer), offset);

    // Return as a File object with the configured CGPE extension.
    const encryptedName = file.name + CGPE_FILE_EXTENSION;
    return new File([cgpe.buffer], encryptedName, {
        type: "application/octet-stream"
    });
}

// =========================
// Decrypt CGPE binary blob → original file
// =========================

async function decrypt_cgpe(arrayBuffer, password, existingAesKey = null) {
    const data = new Uint8Array(arrayBuffer);
    const formats = get_cgpe_formats();
    const minimumContainerBytes = Math.min(
        ...formats.map((format) => {
            const cryptoProfile = CGPE_CRYPTO_PROFILES[format.crypto_profile];
            return format.magic_bytes.length + 1 + 4 + 4 +
                cryptoProfile.iv_bytes + cryptoProfile.gcm_tag_bytes;
        })
    );

    if (data.length < minimumContainerBytes) {
        throw new Error("Not a valid CGPE file.");
    }

    const magicMatches = formats.filter((format) =>
        format.magic_bytes.every((byte, index) => data[index] === byte)
    );
    if (magicMatches.length === 0) {
        throw new Error("Not a valid CGPE file.");
    }

    const format = magicMatches.find((candidate) =>
        data[candidate.magic_bytes.length] === candidate.version
    );
    if (!format) {
        const magicLength = magicMatches[0].magic_bytes.length;
        throw new Error(
            "Unsupported CGPE version: " + data[magicLength]
        );
    }

    const cryptoProfile = CGPE_CRYPTO_PROFILES[format.crypto_profile];

    const maximumContainerBytes = get_cgpe_max_container_bytes_for_format(format);
    if (data.length > maximumContainerBytes) {
        throw new Error(
            `This encrypted file is larger than CipherGap's ${format_file_size_limit(format.max_file_bytes)} safety limit.`
        );
    }

    let offset = format.magic_bytes.length + 1;

    // Read original filename length
    const nameLen = (data[offset] | (data[offset + 1] << 8) |
                     (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
    offset += 4;

    if (nameLen === 0 || nameLen > format.max_filename_bytes ||
        offset + nameLen + 4 + cryptoProfile.iv_bytes +
            cryptoProfile.gcm_tag_bytes > data.length) {
        throw new Error("The CGPE filename metadata is invalid.");
    }

    // Read original filename
    // Buffer views work across Firefox content-script Xrays without consulting
    // the page's TypedArray constructor or changing the wire format.
    const nameBytes = new Uint8Array(data.buffer, data.byteOffset + offset, nameLen);
    const decodedName = globalThis.CipherGapShared.encoding.decode_utf8(nameBytes);
    const originalName = sanitize_cgpe_filename(decodedName);
    offset += nameLen;

    // Read original MIME type length
    const mimeLen = (data[offset] | (data[offset + 1] << 8) |
                     (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
    offset += 4;

    if (mimeLen > format.max_mime_bytes ||
        offset + mimeLen + cryptoProfile.iv_bytes +
            cryptoProfile.gcm_tag_bytes > data.length) {
        throw new Error("The CGPE MIME metadata is invalid.");
    }

    // Read original MIME type
    const mimeBytes = new Uint8Array(data.buffer, data.byteOffset + offset, mimeLen);
    const originalMime = globalThis.CipherGapShared.encoding
        .decode_utf8(mimeBytes) || "application/octet-stream";
    offset += mimeLen;

    // Read the configured AES-GCM IV.
    const iv = new Uint8Array(data.buffer, data.byteOffset + offset, cryptoProfile.iv_bytes);
    offset += cryptoProfile.iv_bytes;

    // Remaining bytes are ciphertext
    const ciphertext = new Uint8Array(data.buffer, data.byteOffset + offset, data.byteLength - offset);

    // Decrypt
    const canReuseExistingKey =
        format.crypto_profile ===
        globalThis.CipherGapShared.crypto.get_message_crypto_profile().id;
    const aesKey = existingAesKey && canReuseExistingKey
        ? existingAesKey
        : await globalThis.CipherGapShared.crypto.derive_aes_key_for_profile(
            password,
            cryptoProfile
        );
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: cryptoProfile.aes_algorithm, iv },
        aesKey,
        ciphertext
    );

    return {
        name: originalName,
        type: originalMime,
        data: decryptedBuffer
    };
}

// Do not let metadata from an encrypted file create path-like download names.
function sanitize_cgpe_filename(filename) {
    const leafName = filename.replace(/\\/g, "/").split("/").pop();
    const cleanName = leafName
        .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "")
        .trim();
    return cleanName && cleanName !== "." && cleanName !== ".."
        ? cleanName
        : "decrypted-file";
}

// =========================
// Check if a File/Blob is a CGPE encrypted file
// =========================

async function is_cgpe_file(file) {
    if (!file) {
        return false;
    }

    // Quick check: does the filename use the configured CGPE extension?
    if (
        file.name &&
        get_cgpe_formats().some((format) =>
            file.name.toLowerCase().endsWith(format.extension.toLowerCase())
        )
    ) {
        return true;
    }

    // Fallback: read the binary magic and check it.
    try {
        const maximumMagicBytes = Math.max(
            ...get_cgpe_formats().map((format) => format.magic_bytes.length)
        );
        const slice = file.slice(0, maximumMagicBytes);
        const header = await slice.arrayBuffer();
        const view = new Uint8Array(header);
        return get_cgpe_formats().some((format) =>
            format.magic_bytes.every((byte, index) => view[index] === byte)
        );
    } catch {
        return false;
    }
}

globalThis.CipherGapShared.file_crypto = Object.freeze({
    write_format: CGPE_WRITE_FORMAT,
    encrypt_file,
    decrypt_cgpe,
    sanitize_cgpe_filename,
    is_cgpe_file,
    contains_cgpe_filename,
    get_cgpe_max_container_bytes,
    get_cgpe_file_extensions,
    get_cgpe_file_accept,
    get_cgpe_write_file_size_label,
    get_cgpe_max_file_size_label,
    derive_cgpe_write_key
});
