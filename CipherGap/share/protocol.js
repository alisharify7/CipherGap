// CipherGap text wire formats.
// Messenger adapters locate raw text in their DOM, then delegate all format
// detection, validation, parsing, and canonical serialization to this file.

const CIPHERGAP_MESSAGE_NOTICE = "این پیام با افزونه CipherGap رمزنگاری شده است. برای رمزگشایی، افزونه را از لینک زیر دانلود و نصب کنید:\nhttps://github.com/alisharify7/CipherGap";
// Messengers may split lines into separate text nodes or remove line breaks.
const CIPHERGAP_NOTICE_PATTERN = new RegExp(CIPHERGAP_MESSAGE_NOTICE
    .split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s\\u200B-\\u200D\\uFEFF]*"));

function find_ciphergap_notice(text) {
    const match = CIPHERGAP_NOTICE_PATTERN.exec(text ?? "");
    return match ? { index: match.index, length: match[0].length } : null;
}

function strip_ciphergap_notice(text) {
    const notice = find_ciphergap_notice(text);
    return notice && is_ciphergap_packet(text) &&
        !text.slice(notice.index + notice.length).trim()
        ? text.slice(0, notice.index).trimEnd() : text;
}

function get_format_codecs(formatName) {
    return Object.values(
        globalThis.CipherGapShared.formats[formatName].codecs
    );
}

function get_write_codec(formatName) {
    const registry = globalThis.CipherGapShared.formats[formatName];
    return registry.codecs[registry.write_codec];
}

function resolve_codec(formatName, codecOrId = null) {
    const registry = globalThis.CipherGapShared.formats[formatName];
    if (!codecOrId) {
        return registry.codecs[registry.write_codec];
    }

    const codecId = typeof codecOrId === "string"
        ? codecOrId
        : codecOrId.id;
    return registry.codecs[codecId] ?? null;
}

function get_exchange_codec(codecOrId = null) {
    return resolve_codec("exchange", codecOrId);
}

function get_message_codec(codecOrId = null) {
    return resolve_codec("message", codecOrId);
}

function build_ciphergap_packet(
    encryptedPayload,
    timestamp = null,
    codecOrId = null
) {
    const format = get_message_codec(codecOrId);
    if (!format) {
        throw new Error("Unsupported encrypted-message codec.");
    }
    const createdAt = timestamp ?? Math.floor(Date.now() / 1000);

    return [
        format.prefix,
        format.version,
        format.algorithm,
        createdAt,
        encryptedPayload
    ].join(format.separator) + "\n\n" + CIPHERGAP_MESSAGE_NOTICE;
}

function parse_ciphergap_packet(packet) {
    if (!packet) {
        return null;
    }

    for (const format of get_format_codecs("message")) {
        const parts = strip_ciphergap_notice(packet).trim().split(format.separator);

        // Preserve legacy behavior: a recognized marker with the established
        // field layout is parsed even when its version/algorithm is unknown.
        // Consumers can dispatch on the returned fields as codecs evolve.
        if (parts.length >= 5 && parts[0] === format.prefix) {
            return {
                version: parts[1],
                algorithm: parts[2],
                timestamp: parts[3],
                data: parts.slice(4).join(format.separator)
            };
        }
    }

    return null;
}

function is_ciphergap_packet(text) {
    const normalized = text?.trim();
    return Boolean(normalized) && get_format_codecs("message").some(
        (format) => normalized.startsWith(
            `${format.prefix}${format.separator}`
        )
    );
}

function get_ciphergap_packet_codec(packetOrParsed) {
    if (typeof packetOrParsed === "string") {
        const normalized = packetOrParsed.trim();
        for (const format of get_format_codecs("message")) {
            const parts = normalized.split(format.separator);
            if (
                parts.length >= 5 &&
                parts[0] === format.prefix &&
                parts[1] === format.version &&
                parts[2] === format.algorithm
            ) {
                return format;
            }
        }

        return null;
    }

    const parsed = packetOrParsed;
    if (!parsed) {
        return null;
    }

    return get_format_codecs("message").find((format) =>
        format.version === parsed.version &&
        format.algorithm === parsed.algorithm
    ) ?? null;
}

function get_ciphergap_packet_crypto_profile(packetOrParsed) {
    const codec = get_ciphergap_packet_codec(packetOrParsed);
    return codec
        ? globalThis.CipherGapShared.formats.crypto.profiles[
            codec.crypto_profile
        ]
        : null;
}

function normalize_exchange_text(text) {
    return String(text ?? "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\r\n]+/g, " ")
        .trim();
}

function get_exchange_body(normalized, prefix) {
    if (!normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
        return null;
    }
    return normalized.slice(prefix.length).trimStart();
}

function build_start_exchange_message(
    nonce,
    publicKeyB64,
    codecOrId = null
) {
    const format = get_exchange_codec(codecOrId);
    if (!format) {
        throw new Error("Unsupported key-exchange codec.");
    }
    return `${format.start_prefix} ${nonce}${format.separator}${publicKeyB64}`;
}

function build_ack_exchange_message(
    nonce,
    publicKeyB64,
    codecOrId = null
) {
    const format = get_exchange_codec(codecOrId);
    if (!format) {
        throw new Error("Unsupported key-exchange codec.");
    }
    return `${format.ack_prefix} ${nonce}${format.separator}${publicKeyB64}`;
}

function build_sas_message(
    sas,
    fingerprint,
    codecOrId = null
) {
    const format = get_exchange_codec(codecOrId);
    if (!format) {
        throw new Error("Unsupported key-exchange codec.");
    }
    return [format.sas_prefix, sas, fingerprint].join(format.separator);
}

function parse_exchange_candidate(normalized, format) {
    for (const [type, prefix] of [
        ["start", format.start_prefix],
        ["ack", format.ack_prefix]
    ]) {
        const body = get_exchange_body(normalized, prefix);
        if (body === null) {
            continue;
        }

        const separatorIndex = body.indexOf(format.separator);
        if (separatorIndex === -1) {
            continue;
        }

        return {
            format,
            parsed: {
                type,
                nonce: body.slice(0, separatorIndex).replace(/\s+/g, ""),
                publicKeyB64: body.slice(separatorIndex + 1).replace(/\s+/g, "")
            }
        };
    }

    const parts = normalized.split(format.separator);
    if (parts[0]?.toLowerCase() === format.sas_prefix.toLowerCase()) {
        return {
            format,
            parsed: {
                type: "sas",
                sas: parts[1] ?? "",
                fingerprint: parts[2]?.toUpperCase() ?? ""
            }
        };
    }

    return null;
}

function get_exchange_message_matches(text) {
    const normalized = normalize_exchange_text(text);
    const formats = get_format_codecs("exchange")
        .map((format, index) => ({
            format,
            index,
            specificity: Math.max(
                format.start_prefix.length,
                format.ack_prefix.length,
                format.sas_prefix.length
            )
        }))
        .sort((first, second) =>
            second.specificity - first.specificity ||
            first.index - second.index
        );

    return formats
        .map(({ format }) => parse_exchange_candidate(normalized, format))
        .filter(Boolean);
}

function parse_exchange_message_with_format(text) {
    return get_exchange_message_matches(text)[0] ?? null;
}

function parse_exchange_message_with_codec(text) {
    const match = parse_exchange_message_with_format(text);
    return match
        ? { codecId: match.format.id, parsed: match.parsed }
        : null;
}

function parse_exchange_message(text) {
    return parse_exchange_message_with_format(text)?.parsed ?? null;
}

function is_exchange_message(text) {
    if (!text) {
        return false;
    }

    const normalized = normalize_exchange_text(text).toLowerCase();
    return get_format_codecs("exchange").some((format) =>
        normalized.startsWith(format.start_prefix.toLowerCase()) ||
        normalized.startsWith(format.ack_prefix.toLowerCase()) ||
        normalized.startsWith(
            `${format.sas_prefix}${format.separator}`.toLowerCase()
        )
    );
}

function contains_exchange_marker(text) {
    const normalized = normalize_exchange_text(text).toLowerCase();
    return get_format_codecs("exchange").some((format) =>
        normalized.includes(format.start_prefix.toLowerCase()) ||
        normalized.includes(format.ack_prefix.toLowerCase()) ||
        normalized.includes(
            `${format.sas_prefix}${format.separator}`.toLowerCase()
        )
    );
}

function is_valid_sas(sas, format = null) {
    const formats = format ? [format] : get_format_codecs("exchange");
    return formats.some((candidate) =>
        new RegExp(`^\\d{${candidate.sas_digits}}$`)
            .test(String(sas ?? ""))
    );
}

function is_valid_fingerprint(fingerprint, format = null) {
    const formats = format ? [format] : get_format_codecs("exchange");
    return formats.some((candidate) =>
        new RegExp(`^[A-F0-9]{${candidate.fingerprint_hex_length}}$`, "i")
            .test(String(fingerprint ?? ""))
    );
}

function format_protocol_digits(value) {
    return String(value ?? "").match(/.{1,3}/g)?.join(" ") ?? "";
}

function speak_protocol_digits(value) {
    return String(value ?? "").split("").join(" ");
}

function format_protocol_fingerprint(value) {
    return String(value ?? "").match(/.{1,4}/g)?.join(" ") ?? "";
}

function parse_strict_exchange_message(text) {
    const matches = get_exchange_message_matches(text);

    for (const { format, parsed } of matches) {
        const strictMatch = validate_strict_exchange_match(
            text,
            format,
            parsed
        );
        if (strictMatch) {
            return strictMatch;
        }
    }

    return null;
}

function validate_strict_exchange_match(text, format, parsed) {

    if (parsed.type === "start" || parsed.type === "ack") {
        const noncePattern = new RegExp(`^[a-f0-9]{${format.nonce_hex_length}}$`, "i");
        const validPublicKey =
            parsed.publicKeyB64.length >= format.public_key_min_length &&
            parsed.publicKeyB64.length <= format.public_key_max_length &&
            parsed.publicKeyB64.length % 4 === 0 &&
            /^[A-Za-z0-9+/]+={0,2}$/.test(parsed.publicKeyB64);

        if (!noncePattern.test(parsed.nonce) || !validPublicKey) {
            return null;
        }

        const protocolText = parsed.type === "start"
            ? build_start_exchange_message(parsed.nonce, parsed.publicKeyB64, format)
            : build_ack_exchange_message(parsed.nonce, parsed.publicKeyB64, format);

        return {
            codecId: format.id,
            parsed,
            protocolText,
            signature: `${parsed.type}:${parsed.nonce}`
        };
    }

    const expectedFieldCount = 3;
    const actualFieldCount = normalize_exchange_text(text)
        .split(format.separator)
        .length;

    if (
        actualFieldCount !== expectedFieldCount ||
        !is_valid_sas(parsed.sas, format) ||
        !is_valid_fingerprint(parsed.fingerprint, format)
    ) {
        return null;
    }

    const fingerprint = parsed.fingerprint.toUpperCase();
    return {
        codecId: format.id,
        parsed: { type: "sas", sas: parsed.sas, fingerprint },
        protocolText: build_sas_message(parsed.sas, fingerprint, format),
        signature: `sas:${parsed.sas}:${fingerprint}`
    };
}

globalThis.CipherGapShared.protocol = Object.freeze({
    message_notice: CIPHERGAP_MESSAGE_NOTICE,
    find_ciphergap_notice,
    strip_ciphergap_notice,
    build_ciphergap_packet,
    parse_ciphergap_packet,
    is_ciphergap_packet,
    get_message_codec,
    get_ciphergap_packet_codec,
    get_ciphergap_packet_crypto_profile,
    normalize_exchange_text,
    build_start_exchange_message,
    build_ack_exchange_message,
    build_sas_message,
    get_exchange_codec,
    parse_exchange_message,
    parse_exchange_message_with_codec,
    parse_strict_exchange_message,
    is_exchange_message,
    contains_exchange_marker,
    is_valid_sas,
    is_valid_fingerprint,
    format_protocol_digits,
    speak_protocol_digits,
    format_protocol_fingerprint
});
