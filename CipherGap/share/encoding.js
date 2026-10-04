// Encoding helpers shared by message, file, and ECDH crypto.

function encode_utf8(value) {
    return new TextEncoder().encode(value);
}

function decode_utf8(value) {
    return new TextDecoder().decode(value);
}

function bytes_to_base64(value) {
    const bytes = value instanceof Uint8Array
        ? value
        : new Uint8Array(value);
    const chunkSize = 0x8000;
    let binary = "";

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        // Firefox content-script Xrays block TypedArray species/constructor
        // access. Generic Array slicing avoids that cross-realm lookup.
        const chunk = Array.prototype.slice.call(bytes, offset, offset + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

function base64_to_bytes(value) {
    const binary = atob(value.trim());
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function concat_bytes(...values) {
    const arrays = values.map((value) => value instanceof Uint8Array
        ? value
        : new Uint8Array(value));
    const result = new Uint8Array(
        arrays.reduce((total, value) => total + value.byteLength, 0)
    );
    let offset = 0;

    for (const value of arrays) {
        result.set(value, offset);
        offset += value.byteLength;
    }

    return result;
}

function bytes_to_hex(value) {
    const bytes = value instanceof Uint8Array
        ? value
        : new Uint8Array(value);
    return Array.from(
        bytes,
        (byte) => byte.toString(16).padStart(2, "0")
    ).join("");
}

function is_array_buffer(value) {
    try {
        // Native brand check works across Firefox MAIN/isolated realms and
        // cannot be spoofed with Symbol.toStringTag.
        Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get.call(value);
        return true;
    } catch { return false; }
}

globalThis.CipherGapShared.encoding = Object.freeze({
    is_array_buffer,
    encode_utf8,
    decode_utf8,
    bytes_to_base64,
    base64_to_bytes,
    concat_bytes,
    bytes_to_hex
});
