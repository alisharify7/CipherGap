const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "CipherGap");

globalThis.File = class TestFile extends Blob {
    constructor(parts, name, options = {}) {
        super(parts, options);
        this.name = name;
        this.lastModified = options.lastModified ?? Date.now();
    }
};
globalThis.crypto = webcrypto;
globalThis.window = {
    location: { href: "https://web.bale.ai/chat?id=42" }
};

function load_classic_script(relativePath) {
    const absolutePath = path.join(extensionRoot, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    vm.runInThisContext(source, { filename: absolutePath });
}

[
    "share/namespace.js",
    "share/config.js",
    "share/encoding.js",
    "share/crypto.js",
    "share/file_crypto.js",
    "share/dh_crypto.js",
    "share/protocol.js",
    "share/messenger_adapter.js"
].forEach(load_classic_script);

test("legacy storage names remain unchanged", () => {
    const keys = globalThis.CipherGapShared.storage_keys;
    const chatKey = keys.chat("web.bale.ai", "49589703");

    assert.equal(chatKey, "web.bale.ai_49589703");
    assert.equal(keys.auto_decrypt(chatKey), "web.bale.ai_49589703__auto_decrypt");
    assert.equal(keys.exchange_status(chatKey), "exchange_status_web.bale.ai_49589703");
    assert.equal(keys.key_trust(chatKey), "key_trust_web.bale.ai_49589703");
    assert.equal(keys.peer_fingerprint(chatKey), "peer_fp_web.bale.ai_49589703");
});

test("messenger adapters resolve an explicit reusable chat context", () => {
    const adapters = globalThis.CipherGapShared.messenger_adapters;
    adapters.register("bale", {
        name: "an-adapter-cannot-override-its-registered-name",
        hostnames: ["web.bale.ai"],
        is_active: () => true,
        is_in_chat: (url) => Boolean(url.searchParams.get("id")),
        get_chat_storage_suffix: (url) => url.searchParams.get("id"),
        send_message: async () => {},
        extract_message_text: () => "",
        inject_ui: () => {},
        observe_messages: () => {},
        auto_decrypt_visible_messages: async () => {}
    });

    const context = adapters.resolve_context(
        "https://web.bale.ai/chat?id=42"
    );
    assert.equal(context.supported, true);
    assert.equal(context.messenger, "bale");
    assert.equal(context.adapter.name, "bale");
    assert.equal(context.chatId, "42");
    assert.equal(context.inChat, true);
    assert.equal(context.storageKey, "web.bale.ai_42");
    assert.equal(
        adapters.resolve_context("https://web.bale.ai/chat").inChat,
        false
    );
    assert.throws(
        () => adapters.register("incomplete", {
            hostnames: ["incomplete.example.test"]
        }),
        /requires the is_active\(\) method/
    );
    assert.throws(
        () => adapters.register("bale", {
            ...context.adapter,
            hostnames: ["web.bale.ai", "extra.example.test"]
        }),
        /hostnames must match share\/config\.js/
    );
});

test("CGP v1 adds an installation notice while parsing the original payload", () => {
    const protocol = globalThis.CipherGapShared.protocol;
    const packet = protocol.build_ciphergap_packet("payload|with|pipes", 1700000000);

    const legacy = "CGP|1|AESGCM|1700000000|payload|with|pipes";
    assert.equal(packet, legacy + "\n\n" + protocol.message_notice);
    assert.equal(protocol.strip_ciphergap_notice(packet), legacy);
    assert.deepEqual(protocol.parse_ciphergap_packet(legacy), protocol.parse_ciphergap_packet(packet));
    assert.deepEqual(protocol.parse_ciphergap_packet(packet.replace(/\n/g, "")), protocol.parse_ciphergap_packet(legacy));
    assert.equal(protocol.strip_ciphergap_notice(protocol.message_notice), protocol.message_notice);
    assert.deepEqual(protocol.parse_ciphergap_packet(packet), {
        version: "1",
        algorithm: "AESGCM",
        timestamp: "1700000000",
        data: "payload|with|pipes"
    });
    assert.equal(protocol.is_ciphergap_packet(packet), true);
    assert.equal(protocol.parse_ciphergap_packet("plain text"), null);
    assert.equal(protocol.get_ciphergap_packet_codec(packet).id, "cgp_v1");
    assert.equal(
        protocol.get_ciphergap_packet_crypto_profile(packet).id,
        "aes_gcm_sha256_v1"
    );
    assert.equal(
        protocol.get_ciphergap_packet_crypto_profile(
            "CGP|999|UNKNOWN|1700000000|payload"
        ),
        null
    );
});

test("notice-bearing messages still decrypt and reject altered ciphertext", async () => {
    const { protocol, crypto } = globalThis.CipherGapShared;
    const secret = "notice-round-trip-key";
    const payload = await crypto.encrypt_message("سلام — private message", secret);
    const packet = protocol.build_ciphergap_packet(payload);
    assert.equal(await crypto.decrypt_message(protocol.parse_ciphergap_packet(packet).data, secret), "سلام — private message");
    await assert.rejects(crypto.decrypt_message(protocol.parse_ciphergap_packet(packet).data, "wrong-key"));
});

test("exchange messages use one canonical codec", () => {
    const protocol = globalThis.CipherGapShared.protocol;
    const nonce = "0123456789abcdef0123456789abcdef";
    const publicKey = "A".repeat(88);

    const start = protocol.build_start_exchange_message(nonce, publicKey);
    const ack = protocol.build_ack_exchange_message(nonce, publicKey);
    const sas = protocol.build_sas_message("357943", "F4307BF2");

    assert.equal(start, `start exchange key: ${nonce}|${publicKey}`);
    assert.equal(ack, `start exchange ack: ${nonce}|${publicKey}`);
    assert.equal(sas, "cg-sas|357943|F4307BF2");
    assert.deepEqual(protocol.parse_strict_exchange_message(start), {
        codecId: "exchange_legacy_v1",
        parsed: { type: "start", nonce, publicKeyB64: publicKey },
        protocolText: start,
        signature: `start:${nonce}`
    });
    assert.deepEqual(protocol.parse_strict_exchange_message(sas), {
        codecId: "exchange_legacy_v1",
        parsed: { type: "sas", sas: "357943", fingerprint: "F4307BF2" },
        protocolText: sas,
        signature: "sas:357943:F4307BF2"
    });
    assert.equal(protocol.parse_strict_exchange_message("cg-sas|123|BAD"), null);
    assert.deepEqual(protocol.parse_exchange_message_with_codec(ack), {
        codecId: "exchange_legacy_v1",
        parsed: { type: "ack", nonce, publicKeyB64: publicKey }
    });
    assert.equal(protocol.format_protocol_digits("357943"), "357 943");
    assert.equal(protocol.format_protocol_fingerprint("F4307BF2"), "F430 7BF2");
});

test("legacy exchange messages stay bound to their matched codec", async () => {
    const formats = JSON.parse(JSON.stringify(
        globalThis.CipherGapShared.formats
    ));
    formats.crypto.profiles.ecdh_p256_sha256_v2_test = {
        ...formats.crypto.profiles.ecdh_p256_sha256_v1,
        id: "ecdh_p256_sha256_v2_test",
        sas_entropy_bits: 24
    };
    formats.exchange.codecs.exchange_v2_test = {
        ...formats.exchange.codecs.exchange_legacy_v1,
        id: "exchange_v2_test",
        separator: "~",
        sas_digits: 7,
        crypto_profile: "ecdh_p256_sha256_v2_test"
    };
    formats.exchange.write_codec = "exchange_v2_test";

    const sandbox = vm.createContext({
        CipherGapShared: { formats },
        crypto: webcrypto,
        TextEncoder,
        TextDecoder,
        btoa,
        atob
    });
    for (const relativePath of [
        "share/encoding.js",
        "share/dh_crypto.js",
        "share/protocol.js"
    ]) {
        vm.runInContext(
            fs.readFileSync(path.join(extensionRoot, relativePath), "utf8"),
            sandbox,
            { filename: relativePath }
        );
    }

    const protocol = sandbox.CipherGapShared.protocol;
    const ecdh = sandbox.CipherGapShared.ecdh;
    const nonce = "0123456789abcdef0123456789abcdef";
    const publicKey = "A".repeat(88);
    const legacyStart = protocol.build_start_exchange_message(
        nonce,
        publicKey,
        "exchange_legacy_v1"
    );
    const v2Start = protocol.build_start_exchange_message(
        nonce,
        publicKey,
        "exchange_v2_test"
    );

    assert.equal(
        protocol.parse_strict_exchange_message(legacyStart).codecId,
        "exchange_legacy_v1"
    );
    assert.equal(
        protocol.parse_strict_exchange_message(v2Start).codecId,
        "exchange_v2_test"
    );
    assert.match(
        protocol.build_ack_exchange_message(
            nonce,
            publicKey,
            protocol.parse_strict_exchange_message(legacyStart).codecId
        ),
        /\|/
    );
    assert.equal(
        (await ecdh.derive_sas(
            "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
            "exchange_legacy_v1"
        )).length,
        6
    );
    assert.equal(
        (await ecdh.derive_sas(
            "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
            "exchange_v2_test"
        )).length,
        7
    );
});

test("message encryption round-trips through the shared AES implementation", async () => {
    const sharedCrypto = globalThis.CipherGapShared.crypto;
    const encrypted = await sharedCrypto.encrypt_message(
        "سلام CipherGap",
        "shared-test-secret"
    );

    assert.equal(
        await sharedCrypto.decrypt_message(encrypted, "shared-test-secret"),
        "سلام CipherGap"
    );
    await assert.rejects(
        sharedCrypto.decrypt_message(encrypted, "wrong-secret")
    );
});

test("a legacy AES-GCM payload remains decryptable", async () => {
    const legacyPayload =
        "AAECAwQFBgcICQoL33xWXYImhTKSjVjJtUavt9Wgap/sebzkCgB/RBjSsPt/ig==";

    assert.equal(
        await globalThis.CipherGapShared.crypto.decrypt_message(
            legacyPayload,
            "compat-secret"
        ),
        "legacy CGP payload"
    );
});

test("both ECDH participants derive the same shared secret and SAS", async () => {
    const ecdh = globalThis.CipherGapShared.ecdh;
    const first = await ecdh.create_dh_session();
    const second = await ecdh.create_dh_session();
    const firstSecret = await ecdh.derive_shared_secret_string(
        first.privateKey,
        second.publicKeyB64
    );
    const secondSecret = await ecdh.derive_shared_secret_string(
        second.privateKey,
        first.publicKeyB64
    );

    assert.equal(firstSecret, secondSecret);
    assert.equal(first.codecId, "exchange_legacy_v1");
    assert.equal(await ecdh.derive_sas(firstSecret), await ecdh.derive_sas(secondSecret));
    assert.match(first.nonce, /^[a-f0-9]{32}$/);
    assert.match(await ecdh.compute_key_fingerprint(first.publicKeyB64), /^[A-F0-9]{8}$/);
});

test("legacy SAS and fingerprint derivation vectors remain stable", async () => {
    const ecdh = globalThis.CipherGapShared.ecdh;

    assert.equal(
        await ecdh.derive_sas(
            "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
        ),
        "405724"
    );
    assert.equal(
        await ecdh.compute_key_fingerprint("AQIDBA=="),
        "9F64A747"
    );
});

test("CGPE v1 remains readable through the shared file implementation", async () => {
    const fileCrypto = globalThis.CipherGapShared.file_crypto;
    const original = new File(
        [encode_utf8("shared file payload")],
        "note.txt",
        { type: "text/plain" }
    );
    const encrypted = await fileCrypto.encrypt_file(original, "file-secret");
    const encryptedBytes = new Uint8Array(await encrypted.arrayBuffer());
    const decrypted = await fileCrypto.decrypt_cgpe(
        encryptedBytes.buffer,
        "file-secret"
    );

    assert.equal(encrypted.name, "note.txt.cgpe");
    assert.deepEqual([...encryptedBytes.slice(0, 5)], [0x43, 0x47, 0x50, 0x45, 0x01]);
    assert.equal(decrypted.name, "note.txt");
    assert.equal(decrypted.type, "text/plain");
    assert.equal(decode_utf8(decrypted.data), "shared file payload");
    assert.equal(fileCrypto.get_cgpe_file_accept(), ".cgpe,application/octet-stream");
    assert.equal(fileCrypto.get_cgpe_write_file_size_label(), "100 MB");
});

test("a fixed legacy CGPE v1 container remains decryptable", async () => {
    const legacyContainer = Uint8Array.from(
        Buffer.from(
            "Q0dQRQEKAAAAbGVnYWN5LnR4dAoAAAB0ZXh0L3BsYWluAAECAwQFBgcICQoLD80rfMNpDsJMwQcX8sf6tcxGGmCp5+T9xQzI9zVHKkKyfhU=",
            "base64"
        )
    );
    const decrypted = await globalThis.CipherGapShared.file_crypto.decrypt_cgpe(
        legacyContainer.buffer,
        "compat-file-secret"
    );

    assert.equal(decrypted.name, "legacy.txt");
    assert.equal(decrypted.type, "text/plain");
    assert.equal(decode_utf8(decrypted.data), "legacy file payload");

    const unknownVersion = legacyContainer.slice();
    unknownVersion[4] = 99;
    await assert.rejects(
        globalThis.CipherGapShared.file_crypto.decrypt_cgpe(
            unknownVersion.buffer,
            "compat-file-secret"
        ),
        /Unsupported CGPE version: 99/
    );
    await assert.rejects(
        globalThis.CipherGapShared.file_crypto.decrypt_cgpe(
            legacyContainer.slice(0, 20).buffer,
            "compat-file-secret"
        ),
        /Not a valid CGPE file/
    );
});

test("manifest loads shared utilities before runtime and adapter code", () => {
    const manifest = JSON.parse(
        fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8")
    );
    const scripts = manifest.content_scripts.find((entry) => entry.world !== "MAIN").js;
    const firstRuntimeIndex = scripts.indexOf("content/storage.js");
    const expectedSharedOrder = [
        "share/namespace.js",
        "share/config.js",
        "share/translations.js",
        "share/i18n.js",
        "share/encoding.js",
        "share/crypto.js",
        "share/file_crypto.js",
        "share/dh_crypto.js",
        "share/protocol.js",
        "share/messenger_adapter.js"
    ];

    assert.ok(firstRuntimeIndex > 0);
    assert.deepEqual(scripts.slice(0, expectedSharedOrder.length), expectedSharedOrder);
    scripts.slice(0, firstRuntimeIndex).forEach((relativePath) => {
        assert.match(relativePath, /^(share\/|content\/utils\.js$)/);
    });
    scripts.forEach((relativePath) => {
        assert.equal(
            fs.existsSync(path.join(extensionRoot, relativePath)),
            true,
            `${relativePath} must exist`
        );
    });
});

test("manifest uses the correct browser background context", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
    assert.equal(manifest.manifest_version, 3);
    if (manifest.background.scripts) {
        assert.deepEqual(manifest.background.scripts, ["background.js"]);
        assert.equal(manifest.background.service_worker, undefined);
        assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "140.0");
    } else {
        assert.equal(manifest.background.service_worker, "background.js");
        assert.equal(manifest.browser_specific_settings, undefined);
    }
});

test("popup loads shared configuration and protocol before its module", () => {
    const html = fs.readFileSync(
        path.join(extensionRoot, "popup", "popup.html"),
        "utf8"
    );
    const namespaceIndex = html.indexOf("../share/namespace.js");
    const configIndex = html.indexOf("../share/config.js");
    const protocolIndex = html.indexOf("../share/protocol.js");
    const popupIndex = html.indexOf("./popup.js");

    assert.ok(namespaceIndex >= 0);
    assert.ok(namespaceIndex < configIndex);
    assert.ok(configIndex < protocolIndex);
    assert.ok(protocolIndex < popupIndex);
});

test("Base64 encoding does not access an Xray-protected TypedArray constructor", () => {
    const bytes = Uint8Array.from({ length: 40000 }, (_, index) => index % 256);
    const expected = Buffer.from(bytes).toString("base64");
    Object.defineProperty(bytes, "constructor", {
        get() { throw new Error("Permission denied to access property constructor"); }
    });
    assert.equal(globalThis.CipherGapShared.encoding.bytes_to_base64(bytes), expected);
});


test("ArrayBuffer validation accepts other realms and rejects forged tags", () => {
    const other = vm.runInNewContext("new ArrayBuffer(16)");
    assert.equal(globalThis.CipherGapShared.encoding.is_array_buffer(other), true);
    assert.equal(globalThis.CipherGapShared.encoding.is_array_buffer({
        byteLength: 16, [Symbol.toStringTag]: "ArrayBuffer"
    }), false);
});
