const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const root = path.resolve(__dirname, "../CipherGap");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function harness() {
    const listeners = new Set();
    const posted = [];
    const window = {
        location: { hostname: "fixture.invalid", origin: "https://web.bale.ai" },
        addEventListener: (_, listener) => listeners.add(listener),
        removeEventListener: (_, listener) => listeners.delete(listener),
        postMessage: (data) => posted.push(data)
    };
    const context = vm.createContext({
        window, location: window.location, document: { addEventListener() {} }, crypto: webcrypto,
        TextEncoder, TextDecoder, URL, Blob, ArrayBuffer, Uint8Array, DataView,
        Event, InputEvent: Event, MouseEvent: Event, console, setTimeout, clearTimeout, setInterval, clearInterval,
        get_storage_key: () => context.chatKey,
        wait_for_main_thread: async () => {}, chatKey: "chat-A"
    });
    for (const file of ["namespace", "config", "encoding", "crypto", "file_crypto", "protocol", "messenger_adapter", "chat_ui"]) {
        vm.runInContext(source(`share/${file}.js`), context);
    }
    vm.runInContext(source("content/bale.js"), context);
    vm.runInContext(source("content/chat_runtime.js"), context);
    return {
        context, posted, listeners,
        emit(data) { for (const listener of [...listeners]) listener({ source: window, origin: window.location.origin, data }); }
    };
}

function composer(h) {
    const input = { textContent: "unsent draft", isConnected: true, dispatchEvent() {}, querySelector() { return null; } };
    const sent = [];
    const button = { click: () => { sent.push(input.textContent); input.textContent = ""; } };
    h.context.document.querySelector = (selector) => selector.startsWith("#editable-message-text") ? input : button;
    return { input, sent };
}

test("key-exchange sends preserve drafts and do not erase newly typed text", async () => {
    const h = harness();
    const { input, sent } = composer(h);
    await h.context.chat_send_message("public-key-packet");
    assert.deepEqual(sent, ["public-key-packet"]);
    assert.equal(input.textContent, "unsent draft");
    h.context.document.querySelector = (selector) => selector.startsWith("#editable-message-text") ? input : {
        click() { input.textContent = "new draft typed while sending"; }
    };
    await h.context.chat_send_message("encrypted-packet", { preserveDraft: false });
    assert.equal(input.textContent, "new draft typed while sending");
});

test("changing chats during a send never clicks the new chat's send control", async () => {
    const h = harness();
    const { sent } = composer(h);
    h.context.wait_for_main_thread = async () => { h.context.chatKey = "chat-B"; };
    await assert.rejects(h.context.chat_send_message("packet"), /active chat changed/);
    assert.deepEqual(sent, []);
});

test("a send-control failure retains the draft even for encrypted-message sends", async () => {
    const h = harness();
    const { input } = composer(h);
    h.context.wait_for_main_thread = async () => {
        h.context.document.querySelector = (selector) => selector.startsWith("#editable-message-text") ? input : null;
    };
    await assert.rejects(h.context.chat_send_message("packet", { preserveDraft: false }), /no longer available/);
    assert.equal(input.textContent, "unsent draft");
});

test("native attachment children work for both uncached and cached files", async () => {
    for (const cached of [false, true]) {
        const h = harness();
        const clicks = [];
        const icon = { dispatchEvent: () => clicks.push("icon") };
        const anchor = { tagName: "A", querySelector: () => cached ? {} : null, firstElementChild: { firstElementChild: icon } };
        const carrier = { closest: () => anchor, dispatchEvent: () => clicks.push("filename") };
        const row = { isConnected: true, contains: (element) => element === anchor };
        h.context.find_cgpe_file_in_message = () => ({ element: carrier });
        const result = h.context.request_chat_encrypted_file(row, "example.txt.cgpe", "chat-A");
        const { id } = h.posted[0];
        h.emit({ source: "ciphergap-main", type: "file_ready", id });
        assert.deepEqual(clicks, [cached ? "filename" : "icon"]);
        const bytes = new ArrayBuffer(16);
        h.emit({ source: "ciphergap-main", type: "file_bytes", id: "unrelated", bytes });
        assert.equal(h.listeners.size, 1);
        h.emit({ source: "ciphergap-main", type: "file_bytes", id, bytes });
        assert.equal(await result, bytes);
        assert.equal(h.listeners.size, 0);
        assert.equal(h.posted.at(-1).type, "cancel_file");
    }
});

test("changing chats cancels file requests before another native attachment is clicked", async () => {
    const h = harness();
    const result = h.context.request_chat_encrypted_file({ isConnected: true }, "example.cgpe", "chat-A");
    h.context.chatKey = "chat-B";
    h.emit({ source: "ciphergap-main", type: "file_ready", id: h.posted[0].id });
    await assert.rejects(result, /active chat changed/);
    assert.equal(h.listeners.size, 0);
});

test("automatic receipt is opt-in, ignores history/outgoing files and queues each message once", async () => {
    const h = harness();
    const received = [];
    h.context.refresh_cg_chat_cache = async () => {};
    h.context.chrome = { storage: { local: { get: async () => ({}) } } };
    h.context.download_chat_encrypted_file = async (row) => received.push(row.dataset.sid);
    vm.runInContext('cg_cached_key = "test-key";', h.context);
    const row = (sid, date = Date.now() + 1000, incoming = true) => ({
        dataset: { sid, date: String(date) }, querySelector: () => incoming ? {} : null
    });
    await h.context.auto_receive_chat_file(row("disabled"), {});
    vm.runInContext("cg_cached_auto_files = true;", h.context);
    await h.context.auto_receive_chat_file(row("history", 1), {});
    await h.context.auto_receive_chat_file(row("outgoing", Date.now() + 1000, false), {});
    const incoming = row("incoming");
    await Promise.all([h.context.auto_receive_chat_file(incoming, {}), h.context.auto_receive_chat_file(incoming, {})]);
    assert.deepEqual(received, ["incoming"]);
});

test("reload cleanup removes only this tab's abandoned outgoing exchange", async () => {
    for (const [ownNonce, live, shouldRemove] of [["mine", false, true], ["mine", true, false], [null, false, false]]) {
        const h = harness();
        const removed = [];
        h.context.sessionStorage = { getItem: () => ownNonce };
        h.context.get_pending_key = () => live;
        const key = h.context.CipherGapShared.storage_keys.exchange_status("chat-A");
        h.context.chrome = { storage: { local: {
            get: async () => ({ [key]: { nonce: "mine", status: "waiting", at: Date.now() } }),
            remove: async (item) => removed.push(item)
        } } };
        vm.runInContext(source("content/storage.js"), h.context);
        await h.context.cleanup_stale_exchange_status("chat-A");
        assert.equal(removed.includes(key), shouldRemove);
    }
});

test("MAIN bridge ignores normal/wrong-name/oversize blobs and suppresses only requested downloads", async () => {
    const h = harness();
    const nativeDownloads = [];
    class Anchor {
        click() { nativeDownloads.push(this.download); }
    }
    const blobs = new Map();
    const urls = { createObjectURL(blob) { const url = `blob:https://web.bale.ai/${blobs.size}`; blobs.set(url, blob); return url; } };
    h.context.HTMLAnchorElement = Anchor;
    h.context.HTMLInputElement = class { click() {} };
    h.context.URL = urls;
    h.context.window.fetch = async (url) => ({ blob: async () => blobs.get(url) });
    vm.runInContext(source("content/main_world_bridge.js"), h.context);
    const container = (name) => {
        const filename = new TextEncoder().encode(name);
        const header = new Uint8Array(9 + filename.length);
        header.set([67, 71, 80, 69, 1]);
        new DataView(header.buffer).setUint32(5, filename.length, true);
        header.set(filename, 9);
        return new Blob([header, new Uint8Array(32)]);
    };
    const encrypted = container("example.txt");
    // Cache the file before a request, exactly as Bale's native cache does.
    const cachedURL = urls.createObjectURL(encrypted);
    h.emit({ source: "ciphergap-content", type: "read_file", id: "one", filename: "example.txt.cgpe", maxBytes: 1024 });
    urls.createObjectURL(new Blob(["ordinary image"]));
    urls.createObjectURL(container("other.txt"));
    urls.createObjectURL(new Blob([new Uint8Array(1025)]));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(h.posted.filter((m) => m.type === "file_bytes").length, 0);
    Object.assign(new Anchor(), { download: "ordinary.txt", href: cachedURL }).click();
    Object.assign(new Anchor(), { download: "example.txt.cgpe", href: cachedURL }).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(nativeDownloads, ["ordinary.txt"]);
    const response = h.posted.find((m) => m.type === "file_bytes");
    assert.equal(response.id, "one");
    assert.deepEqual(new Uint8Array(response.bytes), new Uint8Array(await encrypted.arrayBuffer()));
    Object.assign(new Anchor(), { download: "example.txt.cgpe", href: cachedURL }).click();
    assert.deepEqual(nativeDownloads, ["ordinary.txt", "example.txt.cgpe"]);
    h.emit({ source: "ciphergap-content", type: "read_file", id: "late-anchor", filename: "example.txt.cgpe", maxBytes: 1024 });
    const liveURL = urls.createObjectURL(encrypted);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(h.posted.filter(m => m.type === "file_bytes").length, 2);
    Object.assign(new Anchor(), { download: "ordinary.txt", href: liveURL }).click();
    Object.assign(new Anchor(), { download: "example.txt.cgpe", href: liveURL }).click();
    assert.deepEqual(nativeDownloads, ["ordinary.txt", "example.txt.cgpe", "ordinary.txt"]);
    Object.assign(new Anchor(), { download: "example.txt.cgpe", href: liveURL }).click();
    assert.equal(nativeDownloads.at(-1), "example.txt.cgpe"); // Suppression is one-shot.
});

test("mobile send waits for a delayed native control and draft clear without duplicate clicks", async () => {
    const h = harness();
    const { input } = composer(h);
    let ready = false, clicks = 0;
    h.context.document.querySelector = selector => selector.startsWith("#editable-message-text") ? input : ready ? {
        click() { clicks++; setTimeout(() => { input.textContent = ""; }, 200); }
    } : null;
    setTimeout(() => { ready = true; }, 80);
    await h.context.chat_send_message("encrypted mobile packet", {preserveDraft:false});
    assert.equal(clicks, 1);
    assert.equal(input.textContent, "");
});


test("native whitespace normalization does not finish a send before the draft clears", async () => {
    const h = harness();
    const { input } = composer(h);
    Object.defineProperty(input, "innerText", { get() { return this.textContent.replace(/\s+/g, " "); } });
    h.context.document.querySelector = selector => selector.startsWith("#editable-message-text") ? input : {
        click() { setTimeout(() => { input.textContent = ""; }, 80); }
    };
    const sending = h.context.chat_send_message("encrypted\n\npacket", {preserveDraft:false});
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(vm.runInContext("cg_sending", h.context), true);
    await sending;
    assert.equal(input.textContent, "");
});
