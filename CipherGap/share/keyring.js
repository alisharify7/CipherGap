// CipherGap v2 key schedule.
//
//   secret string ──► root key K0 ──► K1 ──► K2 ... (one link per UTC day)
//
// Every chat secret is one of:
//   * a 32-byte random key (base64, what ECDH produces)   -> used directly
//   * a typed passphrase                                   -> PBKDF2-stretched
//   * a ratchet state  "cgfs1:<epoch>:<base64 chain key>"  -> chain starts there
//
// A chain key Kn gives the message/file keys of day n and, one-way, K(n+1).
// A ratchet state therefore cannot derive any day before its own epoch:
// deleting older epochs is what provides forward secrecy.
(function (shared) {
    const enc = shared.encoding;
    const subtle = crypto.subtle;
    const STRONG_KEY = /^[A-Za-z0-9+/]{43}=$/;
    const MAX_CACHED_RINGS = 8;

    function profile() { return shared.formats.crypto.profiles.hkdf_aes_gcm_v2; }
    function fail(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    async function hkdf_bytes(keyBytes, info) {
        const base = await subtle.importKey("raw", keyBytes, "HKDF", false, ["deriveBits"]);
        return new Uint8Array(await subtle.deriveBits({
            name: "HKDF",
            hash: profile().hash_algorithm,
            salt: enc.encode_utf8(profile().hkdf_salt),
            info: enc.encode_utf8(info)
        }, base, 256));
    }

    async function stretch_passphrase(passphrase) {
        const material = await subtle.importKey("raw", enc.encode_utf8(passphrase), "PBKDF2", false, ["deriveBits"]);
        return new Uint8Array(await subtle.deriveBits({
            name: "PBKDF2",
            hash: profile().hash_algorithm,
            salt: enc.encode_utf8(profile().pbkdf2_salt),
            iterations: profile().pbkdf2_iterations
        }, material, 256));
    }

    function parse_secret(secret) {
        if (typeof secret !== "string" || !secret) throw fail("NO_KEY", "No encryption key set for this chat.");
        const prefix = profile().ratchet_prefix + ":";
        if (secret.startsWith(prefix)) {
            const match = /^cgfs1:(\d{1,5}):([A-Za-z0-9+/]{43}=)$/.exec(secret);
            if (!match) throw fail("BAD_KEY", "The saved forward-secrecy key is damaged.");
            return { kind: "ratchet", epoch: Number(match[1]), chain: enc.base64_to_bytes(match[2]) };
        }
        if (STRONG_KEY.test(secret) && enc.base64_to_bytes(secret).length === 32) {
            return { kind: "random", ikm: enc.base64_to_bytes(secret) };
        }
        return { kind: "passphrase" };
    }

    function epoch_of(timestampSeconds) {
        const day = Math.floor(Number(timestampSeconds) / profile().epoch_seconds);
        return day - profile().epoch_origin_day;
    }
    function now_epoch(nowMs = Date.now()) { return epoch_of(nowMs / 1000); }

    async function open(secret) {
        const parsed = parse_secret(secret);
        const chainKeys = new Map();
        const messageKeys = new Map();
        const fileKeys = new Map();
        let legacyKey = null;

        const start = parsed.kind === "ratchet"
            ? () => Promise.resolve({ epoch: parsed.epoch, key: parsed.chain })
            : async () => {
                const ikm = parsed.kind === "random" ? parsed.ikm : await stretch_passphrase(secret);
                return { epoch: 0, key: await hkdf_bytes(ikm, "cg2/root") };
            };
        let startPromise = null;
        const get_start = () => (startPromise ??= start());

        function chain_key(epoch) {
            if (!Number.isInteger(epoch) || epoch < 0) return Promise.reject(fail("BAD_EPOCH", "This message has an invalid key epoch."));
            if (!chainKeys.has(epoch)) {
                chainKeys.set(epoch, (async () => {
                    const origin = await get_start();
                    if (epoch < origin.epoch) {
                        throw fail("KEY_EXPIRED", "This message was protected by a key that has been deleted for forward secrecy.");
                    }
                    if (epoch - origin.epoch > profile().max_epoch_steps) {
                        throw fail("BAD_EPOCH", "This message is too far ahead of the saved key.");
                    }
                    if (epoch === origin.epoch) return origin.key;
                    return hkdf_bytes(await chain_key(epoch - 1), "cg2/next");
                })());
                // A rejected link must not poison later retries.
                chainKeys.get(epoch).catch(() => chainKeys.delete(epoch));
            }
            return chainKeys.get(epoch);
        }

        async function purpose_key(cache, epoch, info) {
            if (!cache.has(epoch)) {
                cache.set(epoch, (async () => {
                    const bytes = await hkdf_bytes(await chain_key(epoch), info);
                    return subtle.importKey("raw", bytes, { name: profile().aes_algorithm }, false, ["encrypt", "decrypt"]);
                })());
                cache.get(epoch).catch(() => cache.delete(epoch));
            }
            return cache.get(epoch);
        }

        return Object.freeze({
            kind: parsed.kind,
            is_ratchet: parsed.kind === "ratchet",
            // Oldest epoch this key can still read (0 for root keys).
            base_epoch: parsed.kind === "ratchet" ? parsed.epoch : 0,
            message_key: (epoch) => purpose_key(messageKeys, epoch, "cg2/msg"),
            file_key: (epoch) => purpose_key(fileKeys, epoch, "cg2/file"),
            // Version 1 used SHA-256(secret) as the AES key.
            async legacy_key() {
                if (parsed.kind === "ratchet") {
                    throw fail("LEGACY_UNAVAILABLE", "This is a version 1 message. Forward secrecy deleted the key it needs.");
                }
                legacyKey ??= (async () => {
                    const hash = await subtle.digest("SHA-256", enc.encode_utf8(secret));
                    return subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
                })();
                return legacyKey;
            },
            // Serialized ratchet state whose oldest readable epoch is `epoch`.
            async ratchet_state(epoch) {
                const key = await chain_key(epoch);
                return `${profile().ratchet_prefix}:${epoch}:${enc.bytes_to_base64(key)}`;
            }
        });
    }

    const rings = new Map();
    function open_cached(secret) {
        if (!rings.has(secret)) {
            if (rings.size >= MAX_CACHED_RINGS) rings.delete(rings.keys().next().value);
            rings.set(secret, open(secret));
            rings.get(secret).catch(() => rings.delete(secret));
        }
        return rings.get(secret);
    }
    function forget_cached() { rings.clear(); }

    function is_ratchet_secret(secret) {
        return typeof secret === "string" && secret.startsWith(profile().ratchet_prefix + ":");
    }

    // Returns the ratchet state string for `secret`, advanced so that nothing
    // older than `retentionEpochs` days is derivable. Returns null if the
    // secret is already at or past that point (nothing to change).
    async function ratchet_forward(secret, retentionEpochs, nowMs = Date.now()) {
        const p = profile();
        const retention = Math.min(p.max_retention_epochs, Math.max(p.min_retention_epochs, Math.floor(retentionEpochs)));
        const target = Math.max(0, now_epoch(nowMs) - retention);
        const ring = await open_cached(secret);
        if (ring.is_ratchet && ring.base_epoch >= target) return null;
        return ring.ratchet_state(target);
    }

    shared.keyring = Object.freeze({
        parse_secret, epoch_of, now_epoch, open: open_cached, forget_cached,
        is_ratchet_secret, ratchet_forward
    });
})(globalThis.CipherGapShared);
