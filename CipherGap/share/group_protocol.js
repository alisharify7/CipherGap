// Secure-group key distribution (messenger-agnostic).
//
// One member (the creator) owns the group key. Members join in the chat:
//   creator  : cg-group-invite|<gid>|<creator public key>|<expires>
//   member   : cg-group-join  |<gid>|<member public key> |<expires>
//   creator  : cg-group-key   |<gid>|<member fingerprint>|<sealed key>|<expires>
// The sealed key is AES-256-GCM under HKDF(ECDH(creator, member)), bound to the
// group id, the member fingerprint and the expiry. Everyone in the chat sees
// every message; only the addressed member can open its key.
(function (shared) {
    const SEPARATOR = "|";
    const PREFIXES = Object.freeze({
        invite: "cg-group-invite",
        join: "cg-group-join",
        key: "cg-group-key",
        // Fresh key for an existing member (key rotation / member removal).
        rekey: "cg-group-rekey"
    });
    const MARKER = "cg-group-";
    const WRAP_SALT = "ciphergap/group/v1";

    function normalize(text) {
        return shared.protocol.normalize_exchange_text(text);
    }
    function contains_marker(text) {
        return normalize(text).toLowerCase().includes(MARKER);
    }

    const GID = /^[a-f0-9]{32}$/;
    const FINGERPRINT = /^[A-F0-9]{8}$/;
    const EXPIRES = /^\d{13}$/;
    function valid_public_key(value) {
        return value.length >= 80 && value.length <= 1024 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
    }
    function valid_sealed(value) {
        return value.length >= 40 && value.length <= 600 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
    }

    function build_invite(gid, publicKeyB64, expiresAt) {
        return [PREFIXES.invite, gid, publicKeyB64, expiresAt].join(SEPARATOR);
    }
    function build_join(gid, publicKeyB64, expiresAt) {
        return [PREFIXES.join, gid, publicKeyB64, expiresAt].join(SEPARATOR);
    }
    function build_key(gid, fingerprint, sealed, expiresAt) {
        return [PREFIXES.key, gid, fingerprint, sealed, expiresAt].join(SEPARATOR);
    }
    // For a rekey the last field is the issue time (ms): it orders rotations.
    function build_rekey(gid, fingerprint, sealed, issuedAt) {
        return [PREFIXES.rekey, gid, fingerprint, sealed, issuedAt].join(SEPARATOR);
    }

    // Strict parse of a complete protocol message. Returns null when invalid.
    function parse(text) {
        const normalized = normalize(text).replace(/\s+/g, "");
        const parts = normalized.split(SEPARATOR);
        const type = Object.keys(PREFIXES).find(name => PREFIXES[name] === parts[0].toLowerCase());
        if (!type) return null;
        const gid = parts[1]?.toLowerCase();
        if (!GID.test(gid ?? "")) return null;
        if (type === "key" || type === "rekey") {
            if (parts.length !== 5) return null;
            const fingerprint = parts[2].toUpperCase();
            if (!FINGERPRINT.test(fingerprint) || !valid_sealed(parts[3]) || !EXPIRES.test(parts[4])) return null;
            return { type, gid, fingerprint, sealed: parts[3], expiresAt: Number(parts[4]),
                protocolText: (type === "key" ? build_key : build_rekey)(gid, fingerprint, parts[3], parts[4]),
                signature: `${type}:${gid}:${fingerprint}:${type === "rekey" ? parts[4] : ""}` };
        }
        if (parts.length !== 4 || !valid_public_key(parts[2]) || !EXPIRES.test(parts[3])) return null;
        return { type, gid, publicKeyB64: parts[2], expiresAt: Number(parts[3]),
            protocolText: (type === "invite" ? build_invite : build_join)(gid, parts[2], parts[3]),
            signature: `${type}:${gid}:${parts[2].slice(-24)}` };
    }

    function generate_group_id() {
        return shared.encoding.bytes_to_hex(crypto.getRandomValues(new Uint8Array(16)));
    }
    function generate_group_secret() {
        return shared.encoding.bytes_to_base64(crypto.getRandomValues(new Uint8Array(32)));
    }

    async function wrap_key(ownPrivateKey, peerPublicKeyB64, gid, fingerprint) {
        const secret = await shared.ecdh.derive_shared_secret_string(ownPrivateKey, peerPublicKeyB64);
        const base = await crypto.subtle.importKey("raw", shared.encoding.base64_to_bytes(secret), "HKDF", false, ["deriveKey"]);
        return crypto.subtle.deriveKey({
            name: "HKDF", hash: "SHA-256",
            salt: shared.encoding.encode_utf8(WRAP_SALT),
            info: shared.encoding.encode_utf8(`wrap|${gid}|${fingerprint}`)
        }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    }
    function aad(gid, fingerprint, expiresAt, type = "key") {
        return shared.encoding.encode_utf8([PREFIXES[type], gid, fingerprint, expiresAt].join(SEPARATOR));
    }

    // Creator side: seal `groupSecret` for the member whose public key is given.
    async function seal_group_key(creatorPrivateKey, memberPublicKeyB64, gid, expiresAt, groupSecret, type = "key") {
        const fingerprint = await shared.ecdh.compute_key_fingerprint(memberPublicKeyB64);
        const key = await wrap_key(creatorPrivateKey, memberPublicKeyB64, gid, fingerprint);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(gid, fingerprint, expiresAt, type) }, key, shared.encoding.encode_utf8(groupSecret));
        return { fingerprint, sealed: shared.encoding.bytes_to_base64(shared.encoding.concat_bytes(iv, sealed)) };
    }

    // Member side: open a sealed key addressed to us by the creator.
    async function open_group_key(memberPrivateKey, creatorPublicKeyB64, parsed) {
        const key = await wrap_key(memberPrivateKey, creatorPublicKeyB64, parsed.gid, parsed.fingerprint);
        const bytes = shared.encoding.base64_to_bytes(parsed.sealed);
        if (bytes.length < 12 + 16 + 1) throw new Error("This group key message is damaged.");
        try {
            const plain = await crypto.subtle.decrypt({
                name: "AES-GCM", iv: bytes.slice(0, 12),
                additionalData: aad(parsed.gid, parsed.fingerprint, parsed.expiresAt, parsed.type === "rekey" ? "rekey" : "key")
            }, key, bytes.slice(12));
            return shared.encoding.decode_utf8(plain);
        } catch {
            throw new Error("This group key was not created by the group invite you accepted.");
        }
    }

    shared.group = Object.freeze({
        PREFIXES, contains_marker, parse, build_invite, build_join, build_key, build_rekey,
        generate_group_id, generate_group_secret, seal_group_key, open_group_key
    });
})(globalThis.CipherGapShared);
