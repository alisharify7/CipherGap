const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

function harness() {
    let now = 1791060000000;
    const state = {}, sent = [];
    const context = vm.createContext({
        crypto: webcrypto, TextEncoder, TextDecoder, URL, btoa, atob, DOMException, console,
        Date: class extends Date { static now() { return now; } },
        setTimeout() {}, clearTimeout() {},
        sessionStorage: { getItem() { return null; }, setItem() {} },
        window: { location: { href: 'https://web.bale.ai/chat?uid=601' } },
        chrome: { storage: { local: {
            async get(keys) { return Object.fromEntries((typeof keys === 'string' ? [keys] : keys).map(key => [key, state[key]])); },
            async set(updates) { Object.assign(state, updates); },
            async remove(keys) { for (const key of typeof keys === 'string' ? [keys] : keys) delete state[key]; }
        } } }
    });
    for (const file of ['share/namespace.js','share/config.js','share/encoding.js','share/crypto.js','share/dh_crypto.js','share/protocol.js','share/messenger_adapter.js','content/storage.js','content/key_exchange.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname,'../CipherGap',file),'utf8'),context);
    }
    context.CipherGapShared.messenger_adapters.register('bale', {
        hostnames: ['web.bale.ai'], is_active: () => true, is_in_chat: () => true,
        get_chat_storage_suffix: url => url.searchParams.get('uid'),
        send_message: async message => { sent.push(message); }, extract_message_text() {}, inject_ui() {}, observe_messages() {}, auto_decrypt_visible_messages() {}
    });
    const key = 'web.bale.ai_601', statusKey = 'exchange_status_' + key;
    return { context, state, sent, key, statusKey, now: () => now, advance: ms => { now += ms; } };
}

test('incoming requests expire from sending time and cannot be reopened or accepted', async () => {
    const h = harness(), p = h.context.CipherGapShared.protocol;
    const session = await h.context.CipherGapShared.ecdh.create_dh_session();
    const expiry = h.now() + 15 * 60 * 1000;
    const message = p.build_start_exchange_message(session.nonce, session.publicKeyB64, null, expiry);
    h.advance(10 * 60 * 1000);
    await h.context.handle_incoming_exchange_message(message);
    assert.equal(h.state[h.statusKey].expiresAt, expiry);
    h.advance(5 * 60 * 1000);
    await assert.rejects(h.context.respond_to_incoming_exchange(true, session.nonce), /pending|expired/);
    await h.context.handle_incoming_exchange_message(message);
    assert.equal(h.state[h.statusKey], undefined);
    assert.equal(h.state[h.key], undefined);
    assert.equal(h.sent.length, 0);
});

test('late and changed-deadline ACKs never replace the existing chat key', async () => {
    const h = harness(), p = h.context.CipherGapShared.protocol;
    h.state[h.key] = 'keep-existing-key';
    const outgoing = await h.context.start_key_exchange();
    const peer = await h.context.CipherGapShared.ecdh.create_dh_session();
    const expiry = h.state[h.statusKey].expiresAt;
    const altered = p.build_ack_exchange_message(outgoing.nonce, peer.publicKeyB64, null, expiry + 1);
    await h.context.handle_incoming_exchange_message(altered);
    assert.equal(h.state[h.key], 'keep-existing-key');
    h.advance(15 * 60 * 1000);
    const late = p.build_ack_exchange_message(outgoing.nonce, peer.publicKeyB64, null, expiry);
    await h.context.handle_incoming_exchange_message(late);
    assert.equal(h.state[h.key], 'keep-existing-key');
    assert.equal(h.state[h.statusKey].status, 'waiting');
});

test('SAS verification expires at the original deadline without deleting the key', async () => {
    const h = harness(), nonce = 'a'.repeat(32), fp = '1234ABCD';
    h.state[h.key] = 'keep-key';
    h.state[h.statusKey] = { status: 'complete', nonce, fingerprint: fp, at: h.now() + 600000, expiresAt: h.now() + 900000 };
    h.state['key_trust_' + h.key] = { state: 'unverified', source: 'exchange', nonce, fingerprint: fp };
    h.advance(900000);
    await assert.rejects(h.context.mark_current_exchange_verified(nonce), /expired/);
    assert.equal(h.state['key_trust_' + h.key].state, 'unverified');
    await h.context.cleanup_stale_exchange_status(h.key);
    assert.equal(h.state[h.key], 'keep-key');
    assert.equal(h.state[h.statusKey], undefined);
});

test('legacy requests use Bale sending time; malformed timed packets are rejected', async () => {
    const h = harness(), p = h.context.CipherGapShared.protocol;
    const session = await h.context.CipherGapShared.ecdh.create_dh_session();
    const legacy = p.build_start_exchange_message(session.nonce, session.publicKeyB64);
    await h.context.handle_incoming_exchange_message(legacy, h.now() - 900000);
    assert.equal(h.state[h.statusKey], undefined);
    assert.equal(p.parse_strict_exchange_message(legacy + '|never'), null);
    assert.equal(p.parse_strict_exchange_message('cg-sas|123456|1234ABCD|never'), null);
});
