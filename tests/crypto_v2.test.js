const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..", "CipherGap");
globalThis.crypto = webcrypto;
for (const file of ["namespace", "config", "encoding", "keyring", "crypto", "protocol"]) {
    const full = path.join(root, "share", file + ".js");
    vm.runInThisContext(fs.readFileSync(full, "utf8"), { filename: full });
}
const S = globalThis.CipherGapShared;
const b64 = (n) => S.encoding.bytes_to_base64(webcrypto.getRandomValues(new Uint8Array(n)));
const day = 86400;
const at = (offsetDays) => Math.floor(Date.now() / 1000) + offsetDays * day;

test("v2 round trip, packet shape and v1 still readable", async () => {
    const secret = b64(32);
    const packet = await S.crypto.seal_message("سلام 👋", secret);
    assert.match(packet, /^CGP\|2\|AESGCMHKDF\|\d{10}\|/);
    assert.equal((await S.crypto.open_message(packet, secret)).text, "سلام 👋");

    const v1data = await S.crypto.encrypt_message("old", secret);
    const v1 = S.protocol.build_ciphergap_packet(v1data, null, "cgp_v1");
    const opened = await S.crypto.open_message(v1, secret);
    assert.equal(opened.text, "old");
    assert.equal(opened.version, 1);
});

test("tampering with timestamp, version or data is rejected", async () => {
    const secret = b64(32);
    const packet = await S.crypto.seal_message("hi", secret, null, { timestamp: at(0) });
    const parts = packet.split("|");
    const forged = [...parts]; forged[3] = String(Number(parts[3]) + 1);
    await assert.rejects(S.crypto.open_message(forged.join("|"), secret), { code: "AUTH_FAILED" });
    await assert.rejects(S.crypto.open_message(packet, b64(32)), { code: "AUTH_FAILED" });
});

test("typed passphrases are stretched, random keys are not", async () => {
    const t0 = performance.now();
    const packet = await S.crypto.seal_message("p", "correct horse battery");
    assert.ok(performance.now() - t0 > 20, "PBKDF2 should take measurable time");
    assert.equal((await S.crypto.open_message(packet, "correct horse battery")).text, "p");
    await assert.rejects(S.crypto.open_message(packet, "correct horse batterY"));
});

test("self-destruct fields are authenticated and returned", async () => {
    const secret = b64(32);
    const exp = Date.now() + 60000;
    const p = await S.crypto.seal_message("secret", secret, null, { expiresAt: exp, viewSeconds: 30 });
    const o = await S.crypto.open_message(p, secret);
    assert.deepEqual([o.text, o.expiresAt, o.viewSeconds], ["secret", exp, 30]);
});

test("ratchet: forward secrecy and interoperability", async () => {
    const root = b64(32);
    const alice = await S.keyring.ratchet_forward(root, 3);      // ratcheted device
    assert.match(alice, /^cgfs1:\d+:/);
    // A device still holding the root key reads messages from the ratcheted device and vice versa.
    const fromAlice = await S.crypto.seal_message("a->b", alice);
    assert.equal((await S.crypto.open_message(fromAlice, root)).text, "a->b");
    const fromBob = await S.crypto.seal_message("b->a", root);
    assert.equal((await S.crypto.open_message(fromBob, alice)).text, "b->a");

    // Old messages: readable inside the retention window, gone outside it.
    const oldInside = await S.crypto.seal_message("in", root, null, { timestamp: at(-2) });
    assert.equal((await S.crypto.open_message(oldInside, alice)).text, "in");
    const oldOutside = await S.crypto.seal_message("out", root, null, { timestamp: at(-10) });
    await assert.rejects(S.crypto.open_message(oldOutside, alice), { code: "KEY_EXPIRED" });
    assert.equal((await S.crypto.open_message(oldOutside, root)).text, "out");

    // Advancing further deletes more; it can never go back.
    const later = await S.keyring.ratchet_forward(alice, 1, Date.now() + 5 * day * 1000);
    assert.ok(later && later !== alice);
    assert.equal(await S.keyring.ratchet_forward(later, 3, Date.now() + 5 * day * 1000), null);
    await assert.rejects(S.crypto.open_message(oldInside, later), { code: "KEY_EXPIRED" });
    // v1 messages cannot be read from a ratchet state
    const v1 = S.protocol.build_ciphergap_packet(await S.crypto.encrypt_message("x", root), null, "cgp_v1");
    await assert.rejects(S.crypto.open_message(v1, alice), { code: "LEGACY_UNAVAILABLE" });
});

test("future-dated and malformed packets are rejected cheaply", async () => {
    const secret = b64(32);
    await assert.rejects(S.crypto.seal_message("x", secret, null, { timestamp: at(30) }), { code: "BAD_EPOCH" });
    await assert.rejects(S.crypto.open_message("CGP|2|AESGCMHKDF|abc|AAAA", secret));
    await assert.rejects(S.crypto.open_message("CGP|2|AESGCMHKDF|1700000000|AAAA", secret));
});

test("group key delivery: only the addressed member can open the key", async () => {
    for (const file of ["dh_crypto", "group_protocol"]) {
        const full = path.join(root, "share", file + ".js");
        vm.runInThisContext(fs.readFileSync(full, "utf8"), { filename: full });
    }
    const G = S.group, E = S.ecdh;
    const creator = await E.generate_ecdh_keypair(), member = await E.generate_ecdh_keypair(), other = await E.generate_ecdh_keypair();
    const creatorPub = await E.export_public_key_b64(creator.publicKey), memberPub = await E.export_public_key_b64(member.publicKey);
    const gid = G.generate_group_id(), expires = Date.now() + 60000, secret = G.generate_group_secret();
    const invite = G.parse(G.build_invite(gid, creatorPub, expires));
    assert.equal(invite.type, "invite"); assert.equal(invite.gid, gid);
    const sealed = await G.seal_group_key(creator.privateKey, memberPub, gid, expires, secret);
    const keyMessage = G.parse(G.build_key(gid, sealed.fingerprint, sealed.sealed, expires));
    assert.equal(await G.open_group_key(member.privateKey, creatorPub, keyMessage), secret);
    await assert.rejects(G.open_group_key(other.privateKey, creatorPub, keyMessage));
    await assert.rejects(G.open_group_key(member.privateKey, creatorPub, { ...keyMessage, expiresAt: expires + 1 }));
    await assert.rejects(G.open_group_key(member.privateKey, creatorPub, { ...keyMessage, gid: G.generate_group_id() }));
    // Messenger line wrapping and digit localisation do not break parsing.
    const wrapped = G.build_join(gid, memberPub, expires).replace(/(.{40})/g, "$1\n").replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
    assert.equal(G.parse(wrapped).publicKeyB64, memberPub);
    assert.equal(G.parse("cg-group-join|zz|abc|1"), null);
});
