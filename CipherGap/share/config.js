// CipherGap protocol and storage configuration.
//
// This is the single source of truth for values that must stay identical in
// the popup, the protocol implementation, and every messenger adapter.

(function initialize_ciphergap_config(shared) {
    const aes_gcm_sha256_v1 = Object.freeze({
        id: "aes_gcm_sha256_v1",
        aes_algorithm: "AES-GCM",
        hash_algorithm: "SHA-256",
        iv_bytes: 12,
        gcm_tag_bytes: 16
    });
    const ecdh_p256_sha256_v1 = Object.freeze({
        id: "ecdh_p256_sha256_v1",
        key_algorithm: "ECDH",
        named_curve: "P-256",
        derive_bits: 256,
        hash_algorithm: "SHA-256",
        sas_entropy_bits: 20
    });
    const cgp_v1 = Object.freeze({
        id: "cgp_v1",
        prefix: "CGP",
        version: "1",
        algorithm: "AESGCM",
        separator: "|",
        crypto_profile: aes_gcm_sha256_v1.id
    });
    const exchange_legacy_v1 = Object.freeze({
        id: "exchange_legacy_v1",
        start_prefix: "start exchange key:",
        ack_prefix: "start exchange ack:",
        sas_prefix: "cg-sas",
        separator: "|",
        nonce_hex_length: 32,
        public_key_min_length: 80,
        public_key_max_length: 1024,
        sas_digits: 6,
        fingerprint_hex_length: 8,
        crypto_profile: ecdh_p256_sha256_v1.id,
        message_codec: cgp_v1.id
    });
    const cgpe_v1 = Object.freeze({
        id: "cgpe_v1",
        magic: "CGPE",
        magic_bytes: Object.freeze([0x43, 0x47, 0x50, 0x45]),
        version: 0x01,
        extension: ".cgpe",
        max_file_bytes: 100 * 1024 * 1024,
        max_filename_bytes: 4096,
        max_mime_bytes: 1024,
        crypto_profile: aes_gcm_sha256_v1.id
    });

    const formats = Object.freeze({
        message: Object.freeze({
            write_codec: cgp_v1.id,
            codecs: Object.freeze({ [cgp_v1.id]: cgp_v1 })
        }),
        exchange: Object.freeze({
            write_codec: exchange_legacy_v1.id,
            legacy_codec: exchange_legacy_v1.id,
            codecs: Object.freeze({
                [exchange_legacy_v1.id]: exchange_legacy_v1
            })
        }),
        file: Object.freeze({
            write_codec: cgpe_v1.id,
            codecs: Object.freeze({ [cgpe_v1.id]: cgpe_v1 })
        }),
        crypto: Object.freeze({
            profiles: Object.freeze({
                [aes_gcm_sha256_v1.id]: aes_gcm_sha256_v1,
                [ecdh_p256_sha256_v1.id]: ecdh_p256_sha256_v1
            })
        })
    });

    const timeouts = Object.freeze({
        pending_exchange_ms: 15 * 60 * 1000,
        exchange_status_ms: 15 * 60 * 1000,
        popup_exchange_wait_ms: 15 * 60 * 1000,
        handled_nonce_ms: 24 * 60 * 60 * 1000
    });

    const messenger_definitions = Object.freeze({
        bale: Object.freeze({
            id: "bale",
            display_name: "Bale",
            hostnames: Object.freeze(["web.bale.ai"])
        }),
        eitaa: Object.freeze({ id: "eitaa", display_name: "Eitaa", hostnames: Object.freeze(["web.eitaa.com"]) }),
        telegram: Object.freeze({ id: "telegram", display_name: "Telegram Web A", hostnames: Object.freeze(["web.telegram.org"]) }),
        rubika: Object.freeze({ id: "rubika", display_name: "Rubika", hostnames: Object.freeze(["web.rubika.ir"]) }),
        splus: Object.freeze({ id: "splus", display_name: "Soroush Plus", hostnames: Object.freeze(["web.splus.ir"]) })
    });
    const messenger_roadmap = Object.freeze([
        Object.freeze({ id: "whatsapp", display_name: "WhatsApp" })
    ]);

    const messengers = Object.freeze({
        definitions: messenger_definitions,
        roadmap: messenger_roadmap,
        get_by_hostname(hostname) {
            const normalizedHostname = String(hostname ?? "").toLowerCase();
            return Object.values(messenger_definitions).find(
                (messenger) => messenger.hostnames.includes(normalizedHostname)
            ) ?? null;
        }
    });

    const storage_keys = Object.freeze({
        chat(hostname, chatId = null) {
            return chatId === null || chatId === undefined || chatId === ""
                ? hostname
                : `${hostname}_${chatId}`;
        },
        auto_decrypt(chatStorageKey) {
            return `${chatStorageKey}__auto_decrypt`;
        },
        auto_files(chatStorageKey) {
            return `${chatStorageKey}__auto_files`;
        },
        downloaded_files(chatStorageKey) {
            return `${chatStorageKey}__downloaded_files`;
        },
        exchange_status(chatStorageKey) {
            return `exchange_status_${chatStorageKey}`;
        },
        key_trust(chatStorageKey) {
            return `key_trust_${chatStorageKey}`;
        },
        peer_fingerprint(chatStorageKey) {
            return `peer_fp_${chatStorageKey}`;
        },
        handled_nonces: "cg_handled_nonces",
        ui_theme: "ciphergap_ui_theme",
        ui_language: "ciphergap_ui_language",
        enabled: "ciphergap_enabled",
        chat_enabled(chatStorageKey) { return `${chatStorageKey}__enabled`; }
    });

    shared.formats = formats;
    shared.timeouts = timeouts;
    shared.messengers = messengers;
    shared.storage_keys = storage_keys;
})(globalThis.CipherGapShared);
