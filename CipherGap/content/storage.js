
// storage.js

const STORAGE_SHARED_ADAPTERS = globalThis.CipherGapShared.messenger_adapters;

function get_storage_key() {
    return STORAGE_SHARED_ADAPTERS.resolve_context().storageKey;
}

async function get_secret_key() {
    const storageKey = get_storage_key();
    const storage = await chrome.storage.local.get([storageKey]);
    return storage[storageKey];
}

async function set_secret_key(key) {
    const storageKey = get_storage_key();
    await chrome.storage.local.set({ [storageKey]: key });
}

// =========================
// Auto-decrypt setting (per chat)
// =========================

async function get_auto_decrypt() {
    const storageKey = get_storage_key();
    const settingKey = globalThis.CipherGapShared.storage_keys
        .auto_decrypt(storageKey);
    const result = await chrome.storage.local.get([settingKey]);
    return Boolean(result[settingKey]);
}

async function set_auto_decrypt(enabled) {
    const storageKey = get_storage_key();
    const settingKey = globalThis.CipherGapShared.storage_keys
        .auto_decrypt(storageKey);
    await chrome.storage.local.set({ [settingKey]: Boolean(enabled) });
}

// =========================
// Clear key for current chat
// =========================

async function clear_secret_key() {
    const storageKey = get_storage_key();
    await chrome.storage.local.remove([
        storageKey,
        globalThis.CipherGapShared.storage_keys.key_trust(storageKey)
    ]);
}

function is_in_chat() {
    const adapter = STORAGE_SHARED_ADAPTERS.get_active();
    if (adapter?.is_in_chat) {
        return adapter.is_in_chat();
    }

    return get_storage_key().includes("_");
}

function get_current_chat_id() {
    return STORAGE_SHARED_ADAPTERS.resolve_context().chatId;
}

// =========================
// Handled exchange nonces (persistent)
// =========================

const HANDLED_NONCES_KEY = globalThis.CipherGapShared.storage_keys.handled_nonces;
const HANDLED_NONCES_EXPIRY_MS = globalThis.CipherGapShared.timeouts.handled_nonce_ms;

// Load handled nonces from storage. Called once on page load.
async function load_handled_nonces() {
    const result = await chrome.storage.local.get([HANDLED_NONCES_KEY]);
    const entry = result[HANDLED_NONCES_KEY];
    if (!entry) {
        return new Set();
    }

    // Filter out expired nonces
    const now = Date.now();
    const nonces = new Set(
        entry.nonces.filter((item) => now - item.at < HANDLED_NONCES_EXPIRY_MS).map((item) => item.id)
    );

    // Save cleaned list back to storage
    await chrome.storage.local.set({
        [HANDLED_NONCES_KEY]: {
            nonces: entry.nonces.filter((item) => now - item.at < HANDLED_NONCES_EXPIRY_MS)
        }
    });

    return nonces;
}

// Persist a handled nonce to storage so it survives page refresh.
async function save_handled_nonce(nonceId) {
    const result = await chrome.storage.local.get([HANDLED_NONCES_KEY]);
    const entry = result[HANDLED_NONCES_KEY] ?? { nonces: [] };

    entry.nonces.push({ id: nonceId, at: Date.now() });

    await chrome.storage.local.set({ [HANDLED_NONCES_KEY]: entry });
}

// Remove expired handled nonces from storage (run periodically).
async function prune_handled_nonces() {
    const result = await chrome.storage.local.get([HANDLED_NONCES_KEY]);
    const entry = result[HANDLED_NONCES_KEY];
    if (!entry) {
        return;
    }

    const now = Date.now();
    const pruned = entry.nonces.filter((item) => now - item.at < HANDLED_NONCES_EXPIRY_MS);

    if (pruned.length !== entry.nonces.length) {
        await chrome.storage.local.set({ [HANDLED_NONCES_KEY]: { nonces: pruned } });
    }
}


// =========================
// Peer fingerprint (TOFU)
// =========================

async function save_peer_fingerprint(storageKey, fingerprint) {
    const fingerprintKey = globalThis.CipherGapShared.storage_keys
        .peer_fingerprint(storageKey);
    await chrome.storage.local.set({
        [fingerprintKey]: {
            fingerprint,
            at: Date.now()
        }
    });
}

async function get_peer_fingerprint(storageKey) {
    const key = globalThis.CipherGapShared.storage_keys
        .peer_fingerprint(storageKey);
    const result = await chrome.storage.local.get([key]);
    return result[key] ?? null;
}

// =========================
// Stale exchange cleanup
// =========================



// Remove expired exchange_status_* entries from storage so they don't
// linger as phantom "waiting" states when the user returns to a chat later.
async function cleanup_stale_exchange_status(storageKey) {
    // Opportunistically prune expired nonces to keep storage bounded
    prune_handled_nonces().catch(() => {});

    const statusKey = globalThis.CipherGapShared.storage_keys
        .exchange_status(storageKey);
    const result = await chrome.storage.local.get([statusKey]);
    const entry = result[statusKey];

    if (!entry) {
        return;
    }

    // Private ECDH material deliberately stays in memory. After a page reload
    // its outgoing request can no longer complete and must not block setup.
    let ownOutgoingNonce = null;
    try { ownOutgoingNonce = sessionStorage.getItem(`ciphergap_outgoing_${storageKey}`); } catch {}
    if (entry.status === "waiting" && ownOutgoingNonce === entry.nonce && !get_pending_key(storageKey, entry.nonce)) {
        await chrome.storage.local.remove(statusKey);
        return;
    }

    // Already complete — keep it, but only for a limited time
    if (entry.status === "complete" && Date.now() >= globalThis.CipherGapShared.protocol.get_exchange_expires_at(entry)) {
        await chrome.storage.local.remove(statusKey);
        return;
    }

    // Pending outgoing and incoming requests share the same expiry policy.
    if (
        (entry.status === "waiting" || entry.status === "incoming") &&
        Date.now() >= globalThis.CipherGapShared.protocol.get_exchange_expires_at(entry)
    ) {
        await chrome.storage.local.remove(statusKey);
    }
}
