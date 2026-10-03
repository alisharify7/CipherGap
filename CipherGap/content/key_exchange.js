// key_exchange.js — Diffie-Hellman key exchange protocol (messenger-agnostic)
// Enhanced with SAS verification, TOFU fingerprints, and stale exchange cleanup.

const EXCHANGE_TIMEOUT_MS = globalThis.CipherGapShared.timeouts.pending_exchange_ms;
const EXCHANGE_SHARED_PROTOCOL = globalThis.CipherGapShared.protocol;
const EXCHANGE_SHARED_CRYPTO = globalThis.CipherGapShared.crypto;
const EXCHANGE_SHARED_ECDH = globalThis.CipherGapShared.ecdh;
const EXCHANGE_SHARED_ADAPTERS = globalThis.CipherGapShared.messenger_adapters;

// Sent as an encrypted CGP packet when a user confirms the SAS code,
// proving the key was successfully exchanged and verified from their side.
const CONFIRMATION_MESSAGE = "I confirm the SAS code matches — key exchange verified from my side.";

const pending_exchanges = new Map();
const cancelled_exchanges = new Set();
let handled_exchange_nonces = new Set();
let nonces_loaded = false;
let nonces_load_promise = null;

// =========================
// Pending exchange state
// =========================

function get_pending_key(storageKey, nonce) {
    return pending_exchanges.get(`${storageKey}:${nonce}`);
}

function set_pending_exchange(storageKey, nonce, data) {
    const key = `${storageKey}:${nonce}`;
    pending_exchanges.set(key, { ...data, storageKey, nonce, createdAt: Date.now() });

    setTimeout(async () => {
        const entry = pending_exchanges.get(key);
        if (entry) {
            pending_exchanges.delete(key);

            // An old timer must never erase a newer exchange for this chat.
            const statusKey = globalThis.CipherGapShared.storage_keys
                .exchange_status(storageKey);
            try {
                const result = await chrome.storage.local.get([statusKey]);
                if (result[statusKey]?.nonce === nonce) {
                    await chrome.storage.local.remove(statusKey);
                }
            } catch {
                // Storage cleanup is best-effort; the normal stale-status sweep
                // will remove the entry later if this attempt fails.
            }
        }
    }, EXCHANGE_TIMEOUT_MS);
}

function clear_pending_exchanges(storageKey) {
    for (const [key, entry] of pending_exchanges) {
        if (entry.storageKey === storageKey) {
            pending_exchanges.delete(key);
        }
    }
}

// Ensure nonces are loaded from storage before checking.
// Returns true if the nonce was already handled (loaded from previous session).
async function ensure_nonces_loaded() {
    if (nonces_loaded) {
        return;
    }
    if (!nonces_load_promise) {
        nonces_load_promise = (async () => {
            handled_exchange_nonces = await load_handled_nonces();
            nonces_loaded = true;
        })();
    }
    await nonces_load_promise;
}

async function mark_exchange_handled(storageKey, nonce, type) {
    await ensure_nonces_loaded();
    const id = `${storageKey}:${nonce}:${type}`;

    if (handled_exchange_nonces.has(id)) {
        return;
    }

    handled_exchange_nonces.add(id);
    try {
        await save_handled_nonce(id);
    } catch (error) {
        handled_exchange_nonces.delete(id);
        throw error;
    }
}

async function is_exchange_handled(storageKey, nonce, type) {
    await ensure_nonces_loaded();
    return handled_exchange_nonces.has(`${storageKey}:${nonce}:${type}`);
}

// =========================
// TOFU fingerprint check
// =========================

// Before finalizing, verify the peer's key hasn't changed since first use.
// Returns true if the fingerprint is safe to proceed (new or matches stored).
async function verify_peer_fingerprint(
    storageKey,
    peerPublicKeyB64,
    exchangeCodecId
) {
    const fingerprint = await EXCHANGE_SHARED_ECDH
        .compute_key_fingerprint(peerPublicKeyB64, exchangeCodecId);
    const stored = await get_peer_fingerprint(storageKey);

    if (!stored) {
        // The caller persists this first-seen fingerprint atomically with the
        // completed key after the final cancellation check.
        return { ok: true, isNew: true, fingerprint };
    }

    if (stored.fingerprint === fingerprint) {
        return { ok: true, isNew: false, fingerprint };
    }

    // Fingerprint mismatch! Possible MITM or key rotation.
    return {
        ok: false,
        isNew: false,
        fingerprint,
        oldFingerprint: stored.fingerprint
    };
}

// =========================
// Exchange finalization
// =========================

async function finalize_exchange(
    storageKey,
    nonce,
    privateKey,
    peerPublicKeyB64,
    exchangeCodecId
) {
    const exchangeId = `${storageKey}:${nonce}`;
    const exchangeCodec = EXCHANGE_SHARED_PROTOCOL.get_exchange_codec(
        exchangeCodecId
    );
    if (!exchangeCodec) {
        throw new Error("This key-exchange format is not supported.");
    }
    if (cancelled_exchanges.has(exchangeId)) {
        throw new DOMException("The key exchange was cancelled.", "AbortError");
    }

    // TOFU check — warn if peer key changed
    const fpCheck = await verify_peer_fingerprint(
        storageKey,
        peerPublicKeyB64,
        exchangeCodec.id
    );
    if (!fpCheck.ok) {
        console.warn(
            "[CipherGap] Peer key fingerprint mismatch.",
            "Expected:", fpCheck.oldFingerprint,
            "Got:", fpCheck.fingerprint
        );
        // Still allow the exchange but surface the warning
    }

    const sharedSecret = await EXCHANGE_SHARED_ECDH.derive_shared_secret_string(
        privateKey,
        peerPublicKeyB64,
        exchangeCodec.id
    );
    const sas = await EXCHANGE_SHARED_ECDH.derive_sas(
        sharedSecret,
        exchangeCodec.id
    );
    const completedAt = Date.now();
    const trustState = fpCheck.ok ? "unverified" : "changed";

    if (cancelled_exchanges.has(exchangeId)) {
        throw new DOMException("The key exchange was cancelled.", "AbortError");
    }

    const storageUpdates = {
        [storageKey]: sharedSecret,
        [globalThis.CipherGapShared.storage_keys.exchange_status(storageKey)]: {
            status: "complete",
            nonce,
            sas,
            fingerprint: fpCheck.fingerprint,
            fingerprintWarning: !fpCheck.ok,
            oldFingerprint: fpCheck.oldFingerprint ?? null,
            trustState,
            codecId: exchangeCodec.id,
            at: completedAt
        },
        [globalThis.CipherGapShared.storage_keys.key_trust(storageKey)]: {
            state: trustState,
            fingerprint: fpCheck.fingerprint,
            oldFingerprint: fpCheck.oldFingerprint ?? null,
            source: "exchange",
            nonce,
            codecId: exchangeCodec.id,
            at: completedAt
        }
    };

    if (fpCheck.isNew) {
        storageUpdates[
            globalThis.CipherGapShared.storage_keys.peer_fingerprint(storageKey)
        ] = {
            fingerprint: fpCheck.fingerprint,
            at: completedAt
        };
    }

    await chrome.storage.local.set(storageUpdates);

    // Send the SAS code as a chat message so both users can see and verify it
    const adapter = EXCHANGE_SHARED_ADAPTERS.get_active();
    if (adapter) {
        const sasMessage = EXCHANGE_SHARED_PROTOCOL.build_sas_message(
            sas,
            fpCheck.fingerprint,
            exchangeCodec.id
        );
        await adapter.send_message(sasMessage, { storageKey }).catch((err) => {
            console.warn("[CipherGap] Could not send SAS message:", err);
        });
    }

    return {
        sharedSecret,
        sas,
        fingerprint: fpCheck.fingerprint,
        fingerprintWarning: !fpCheck.ok,
        trustState,
        codecId: exchangeCodec.id
    };
}

// =========================
// Incoming message handlers
// =========================

async function handle_incoming_start(parsed, storageKey, exchangeCodecId) {
    // Clear an expired request before checking the persistent scan-dedupe set.
    await cleanup_stale_exchange_status(storageKey);

    if (
        await is_exchange_handled(storageKey, parsed.nonce, "start") ||
        await is_exchange_handled(storageKey, parsed.nonce, "seen")
    ) {
        return;
    }

    const existingPending = get_pending_key(storageKey, parsed.nonce);
    if (existingPending?.role === "initiator") {
        return;
    }

    const statusKey = globalThis.CipherGapShared.storage_keys
        .exchange_status(storageKey);
    const stored = await chrome.storage.local.get([statusKey]);
    const currentStatus = stored[statusKey];

    if (currentStatus?.status === "incoming" && currentStatus.nonce === parsed.nonce) {
        await mark_exchange_handled(storageKey, parsed.nonce, "seen");
        return;
    }

    // Keep the currently-visible consent request stable. A second request can
    // be surfaced after the first one is accepted, declined, or expires.
    if (currentStatus?.status === "incoming" || currentStatus?.status === "waiting") {
        return;
    }

    const fingerprint = await EXCHANGE_SHARED_ECDH
        .compute_key_fingerprint(parsed.publicKeyB64, exchangeCodecId);
    const now = Date.now();

    await chrome.storage.local.set({
        [statusKey]: {
            status: "incoming",
            nonce: parsed.nonce,
            publicKeyB64: parsed.publicKeyB64,
            fingerprint,
            codecId: exchangeCodecId,
            at: now
        }
    });

    // "seen" prevents historical DOM rescans from re-opening a request after
    // it expires. It does not count as accepting or declining the exchange.
    await mark_exchange_handled(storageKey, parsed.nonce, "seen");
}

async function respond_to_incoming_exchange(accept, expectedNonce) {
    const storageKey = get_storage_key();
    await cleanup_stale_exchange_status(storageKey);

    const statusKey = globalThis.CipherGapShared.storage_keys
        .exchange_status(storageKey);
    const stored = await chrome.storage.local.get([statusKey]);
    const incoming = stored[statusKey];

    if (!incoming || incoming.status !== "incoming") {
        throw new Error("There is no pending key exchange request for this chat.");
    }

    if (expectedNonce && incoming.nonce !== expectedNonce) {
        throw new Error("This key exchange request is no longer current.");
    }

    const { nonce, publicKeyB64 } = incoming;
    const exchangeCodec = EXCHANGE_SHARED_PROTOCOL.get_exchange_codec(
        incoming.codecId ||
        globalThis.CipherGapShared.formats.exchange.legacy_codec
    );
    if (!exchangeCodec) {
        throw new Error("This key-exchange request uses an unsupported format.");
    }

    if (!accept) {
        await mark_exchange_handled(storageKey, nonce, "start");
        pending_exchanges.delete(`${storageKey}:${nonce}`);

        const latest = await chrome.storage.local.get([statusKey]);
        if (latest[statusKey]?.status === "incoming" && latest[statusKey]?.nonce === nonce) {
            await chrome.storage.local.remove(statusKey);
        }

        return { accepted: false, nonce, storageKey };
    }

    const adapter = EXCHANGE_SHARED_ADAPTERS.get_active();
    if (!adapter || !adapter.is_in_chat?.()) {
        throw new Error("Open the matching chat before accepting this key exchange.");
    }

    let pending = get_pending_key(storageKey, nonce);
    if (
        !pending ||
        pending.role !== "responder" ||
        pending.peerPublicKeyB64 !== publicKeyB64 ||
        pending.codecId !== exchangeCodec.id
    ) {
        const session = await EXCHANGE_SHARED_ECDH.create_dh_session(
            exchangeCodec.id
        );
        set_pending_exchange(storageKey, nonce, {
            privateKey: session.privateKey,
            publicKeyB64: session.publicKeyB64,
            role: "responder",
            peerPublicKeyB64: publicKeyB64,
            codecId: exchangeCodec.id
        });
        pending = get_pending_key(storageKey, nonce);
    }

    await mark_exchange_handled(storageKey, nonce, "start");

    const ackMessage = EXCHANGE_SHARED_PROTOCOL.build_ack_exchange_message(
        nonce,
        pending.publicKeyB64,
        exchangeCodec.id
    );
    await adapter.send_message(ackMessage, { storageKey });

    const result = await finalize_exchange(
        storageKey,
        nonce,
        pending.privateKey,
        publicKeyB64,
        exchangeCodec.id
    );
    pending_exchanges.delete(`${storageKey}:${nonce}`);

    return { accepted: true, nonce, storageKey, ...result };
}

async function handle_incoming_ack(parsed, storageKey, exchangeCodecId) {
    const exchangeId = `${storageKey}:${parsed.nonce}`;
    if (cancelled_exchanges.has(exchangeId)) {
        return;
    }

    if (await is_exchange_handled(storageKey, parsed.nonce, "ack")) {
        return;
    }

    const pending = get_pending_key(storageKey, parsed.nonce);
    if (
        !pending ||
        pending.role !== "initiator" ||
        pending.codecId !== exchangeCodecId
    ) {
        return;
    }

    await mark_exchange_handled(storageKey, parsed.nonce, "ack");

    if (cancelled_exchanges.has(exchangeId)) {
        pending_exchanges.delete(exchangeId);
        return;
    }

    await finalize_exchange(
        storageKey,
        parsed.nonce,
        pending.privateKey,
        parsed.publicKeyB64,
        exchangeCodecId
    );
    pending_exchanges.delete(exchangeId);
}

async function handle_incoming_exchange_message(text) {
    const match = EXCHANGE_SHARED_PROTOCOL.parse_strict_exchange_message(text);
    if (!match) {
        return;
    }
    const { parsed, codecId } = match;

    // SAS messages are informational — no protocol action
    if (parsed.type === "sas") {
        return;
    }

    const storageKey = get_storage_key();

    if (parsed.type === "start") {
        await handle_incoming_start(parsed, storageKey, codecId);
    } else if (parsed.type === "ack") {
        await handle_incoming_ack(parsed, storageKey, codecId);
    }
}

// =========================
// Initiate exchange
// =========================

async function start_key_exchange() {
    const adapter = EXCHANGE_SHARED_ADAPTERS.get_active();
    if (!adapter) {
        throw new Error("No supported messenger detected on this page.");
    }

    if (!adapter.is_in_chat?.()) {
        throw new Error("Open a chat first before exchanging keys.");
    }

    const storageKey = get_storage_key();

    // Clean up any previous stale exchange status
    await cleanup_stale_exchange_status(storageKey);

    const statusKey = globalThis.CipherGapShared.storage_keys
        .exchange_status(storageKey);
    const existing = await chrome.storage.local.get([statusKey]);
    if (["waiting", "incoming"].includes(existing[statusKey]?.status)) {
        throw new Error("Finish or cancel the current key exchange before starting another one.");
    }

    const session = await EXCHANGE_SHARED_ECDH.create_dh_session();

    set_pending_exchange(storageKey, session.nonce, {
        privateKey: session.privateKey,
        role: "initiator",
        codecId: session.codecId
    });
    // Keep only a public nonce across reloads, never the private ECDH key.
    // A second tab must not clean up the first tab's live exchange.
    try { sessionStorage.setItem(`ciphergap_outgoing_${storageKey}`, session.nonce); } catch {}

    await chrome.storage.local.set({
        [statusKey]: {
            status: "waiting",
            nonce: session.nonce,
            codecId: session.codecId,
            at: Date.now()
        }
    });

    const startMessage = EXCHANGE_SHARED_PROTOCOL.build_start_exchange_message(
        session.nonce,
        session.publicKeyB64,
        session.codecId
    );
    await adapter.send_message(startMessage, { storageKey });

    // Mark our own start nonce as handled so that on page refresh, the
    // scanner doesn't see our old start message and re-respond to ourselves.
    await mark_exchange_handled(storageKey, session.nonce, "start");

    return { nonce: session.nonce, storageKey, codecId: session.codecId };
}

async function cancel_outgoing_exchange(expectedNonce) {
    if (!expectedNonce) {
        throw new Error("A key exchange nonce is required for cancellation.");
    }

    const storageKey = get_storage_key();
    const statusKey = globalThis.CipherGapShared.storage_keys
        .exchange_status(storageKey);
    const stored = await chrome.storage.local.get([statusKey]);
    const status = stored[statusKey];

    if (status && status.nonce !== expectedNonce) {
        throw new Error("This key exchange is no longer current.");
    }
    if (status?.status === "complete") {
        return {
            cancelled: false,
            completed: true,
            nonce: expectedNonce,
            storageKey
        };
    }
    if (status && status.status !== "waiting") {
        throw new Error("This outgoing key exchange can no longer be cancelled.");
    }

    const pendingKey = `${storageKey}:${expectedNonce}`;
    const pending = pending_exchanges.get(pendingKey);
    if (pending && pending.role !== "initiator") {
        throw new Error("Only an outgoing key exchange can be cancelled here.");
    }

    cancelled_exchanges.add(pendingKey);
    setTimeout(() => cancelled_exchanges.delete(pendingKey), EXCHANGE_TIMEOUT_MS);
    pending_exchanges.delete(pendingKey);
    // Ignore a late ACK after the UI has reported cancellation or timeout.
    await mark_exchange_handled(storageKey, expectedNonce, "ack");

    const latest = await chrome.storage.local.get([statusKey]);
    if (
        latest[statusKey]?.status === "waiting" &&
        latest[statusKey]?.nonce === expectedNonce
    ) {
        await chrome.storage.local.remove(statusKey);
    }

    return {
        cancelled: latest[statusKey]?.status !== "complete",
        completed: latest[statusKey]?.status === "complete",
        nonce: expectedNonce,
        storageKey
    };
}

// =========================
// Trust verification
// =========================

async function mark_current_exchange_verified(expectedNonce) {
    if (!expectedNonce) {
        throw new Error("A key exchange nonce is required for verification.");
    }

    const storageKey = get_storage_key();
    const statusKey = globalThis.CipherGapShared.storage_keys
        .exchange_status(storageKey);
    const trustKey = globalThis.CipherGapShared.storage_keys
        .key_trust(storageKey);
    const stored = await chrome.storage.local.get([storageKey, statusKey, trustKey]);
    const status = stored[statusKey];
    const trust = stored[trustKey];

    if (!stored[storageKey]) {
        throw new Error("There is no current encryption key to verify.");
    }

    if (status?.status !== "complete" || status.nonce !== expectedNonce) {
        throw new Error("This key exchange is no longer current.");
    }

    if (
        !trust ||
        trust.source !== "exchange" ||
        trust.nonce !== expectedNonce ||
        trust.fingerprint !== status.fingerprint
    ) {
        throw new Error("The current key does not match this exchange verification.");
    }

    if (!["unverified", "changed", "verified"].includes(trust.state)) {
        throw new Error("The current key has an invalid trust state.");
    }

    const previousState = trust.state;
    const verifiedAt = Date.now();
    const verifiedTrust = {
        ...trust,
        state: "verified",
        at: verifiedAt,
        verifiedAt
    };
    const updates = {
        [trustKey]: verifiedTrust,
        [statusKey]: {
            ...status,
            trustState: "verified",
            verifiedAt
        }
    };

    // Explicit SAS verification approves a changed TOFU fingerprint as the
    // new baseline, avoiding a permanent warning on later exchanges.
    if (previousState === "changed") {
        updates[
            globalThis.CipherGapShared.storage_keys.peer_fingerprint(storageKey)
        ] = {
            fingerprint: trust.fingerprint,
            at: verifiedAt
        };
    }

    await chrome.storage.local.set(updates);
    return { storageKey, nonce: expectedNonce, trust: verifiedTrust };
}

// =========================
// Verification confirmation
// =========================

// Called when the user confirms the SAS code. Encrypts a confirmation
// message with the current chat key and sends it as a CGP packet so the
// peer can see (and decrypt) that the exchange was verified from this side.
async function send_verification_confirmation() {
    const adapter = EXCHANGE_SHARED_ADAPTERS.get_active();
    if (!adapter) {
        throw new Error("No supported messenger detected on this page.");
    }

    const storageKey = get_storage_key();
    const secretKey = await get_secret_key();
    if (!secretKey) {
        throw new Error("No encryption key set for this chat.");
    }

    const statusKey = globalThis.CipherGapShared.storage_keys
        .exchange_status(storageKey);
    const stored = await chrome.storage.local.get([statusKey]);
    const exchangeCodec = EXCHANGE_SHARED_PROTOCOL.get_exchange_codec(
        stored[statusKey]?.codecId ||
        globalThis.CipherGapShared.formats.exchange.legacy_codec
    );
    const messageCodec = EXCHANGE_SHARED_PROTOCOL.get_message_codec(
        exchangeCodec?.message_codec
    );
    const messageCryptoProfile = EXCHANGE_SHARED_CRYPTO
        .get_message_crypto_profile(messageCodec);
    if (!exchangeCodec || !messageCodec || !messageCryptoProfile) {
        throw new Error("This exchange confirmation format is not supported.");
    }

    const encrypted = await EXCHANGE_SHARED_CRYPTO.encrypt_message(
        CONFIRMATION_MESSAGE,
        secretKey,
        null,
        messageCryptoProfile
    );
    const packet = EXCHANGE_SHARED_PROTOCOL.build_ciphergap_packet(
        encrypted,
        null,
        messageCodec.id
    );
    await adapter.send_message(packet, { storageKey });

}

// =========================
// Listener
// =========================

function init_key_exchange_listener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.expectedStorageKey && message.expectedStorageKey !== get_storage_key()) {
            sendResponse({ ok: false, error: "The active chat changed. Reopen CipherGap in the matching conversation." });
            return false;
        }
        if (message.action === "choose_secure_files") {
            choose_bale_secure_files()
                .then(() => sendResponse({ ok: true }))
                .catch((error) => sendResponse({ ok: false, error: error.message }));
            return true;
        }
        if (message.action === "set_auto_files") {
            if (typeof message.enabled !== "boolean") {
                sendResponse({ ok: false, error: "The enabled field must be a boolean." });
                return false;
            }
            chrome.storage.local.set({
                [globalThis.CipherGapShared.storage_keys.auto_files(get_storage_key())]: message.enabled
            }).then(() => sendResponse({ ok: true }))
                .catch((error) => sendResponse({ ok: false, error: error.message }));
            return true;
        }
        if (message.action === "start_key_exchange") {
            start_key_exchange()
                .then((result) => sendResponse({ ok: true, ...result }))
                .catch((error) => sendResponse({ ok: false, error: error.message }));
            return true;
        }

        if (message.action === "respond_key_exchange") {
            if (typeof message.accept !== "boolean") {
                sendResponse({ ok: false, error: "The accept field must be a boolean." });
                return false;
            }

            respond_to_incoming_exchange(message.accept, message.nonce)
                .then((result) => sendResponse({ ok: true, ...result }))
                .catch((error) => sendResponse({ ok: false, error: error.message }));
            return true;
        }

        if (message.action === "cancel_key_exchange") {
            cancel_outgoing_exchange(message.nonce)
                .then((result) => sendResponse({ ok: true, ...result }))
                .catch((error) => sendResponse({ ok: false, error: error.message }));
            return true;
        }

        if (message.action === "mark_key_verified") {
            mark_current_exchange_verified(message.nonce)
                .then((result) => sendResponse({ ok: true, ...result }))
                .catch((error) => sendResponse({ ok: false, error: error.message }));
            return true;
        }

        if (message.action === "get_chat_context") {
            const context = EXCHANGE_SHARED_ADAPTERS.resolve_context();
            sendResponse({
                ok: true,
                supported: context.supported,
                inChat: context.inChat,
                chatId: context.chatId,
                hostname: context.hostname,
                storageKey: context.storageKey,
                messenger: context.messenger
            });
            return false;
        }

        if (message.action === "cleanup_stale_exchange") {
            cleanup_stale_exchange_status(message.storageKey)
                .then(() => sendResponse({ ok: true }))
                .catch((err) => sendResponse({ ok: false, error: err.message }));
            return true;
        }

        if (message.action === "get_auto_decrypt") {
            get_auto_decrypt()
                .then((enabled) => sendResponse({ ok: true, enabled }))
                .catch((err) => sendResponse({ ok: false, error: err.message }));
            return true;
        }

        if (message.action === "set_auto_decrypt") {
            set_auto_decrypt(message.enabled)
                .then(() => sendResponse({ ok: true }))
                .catch((err) => sendResponse({ ok: false, error: err.message }));
            return true;
        }

        if (message.action === "auto_decrypt_sweep") {
            const adapter = EXCHANGE_SHARED_ADAPTERS.get_active();
            if (!adapter?.auto_decrypt_visible_messages) {
                sendResponse({
                    ok: false,
                    error: "Auto-decrypt is unavailable in the current messenger."
                });
                return false;
            }

            Promise.resolve(adapter.auto_decrypt_visible_messages())
                .then(() => sendResponse({ ok: true }))
                .catch((err) => sendResponse({ ok: false, error: err.message }));
            return true;
        }

        if (message.action === "clear_input") {
            const adapter = EXCHANGE_SHARED_ADAPTERS.get_active();
            try {
                const cleared = adapter?.clear_input?.() ?? false;
                sendResponse({ ok: true, cleared });
            } catch (err) {
                sendResponse({ ok: false, error: err.message });
            }
            return false;
        }

        if (message.action === "clear_key") {
            (async () => {
                const storageKey = get_storage_key();
                const statusKey = globalThis.CipherGapShared.storage_keys
                    .exchange_status(storageKey);
                const trustKey = globalThis.CipherGapShared.storage_keys
                    .key_trust(storageKey);
                const stored = await chrome.storage.local.get([
                    storageKey,
                    statusKey,
                    trustKey
                ]);

                if (
                    typeof message.expectedKey === "string" &&
                    stored[storageKey] !== message.expectedKey
                ) {
                    throw new Error("The chat key changed before it could be cleared.");
                }

                if (
                    message.expectedNonce &&
                    stored[statusKey]?.nonce !== message.expectedNonce
                ) {
                    throw new Error("The key exchange changed before it could be cleared.");
                }

                if (message.expectedTrust) {
                    const trust = stored[trustKey];
                    const expectedTrust = message.expectedTrust;
                    if (
                        trust?.source !== expectedTrust.source ||
                        trust?.state !== expectedTrust.state ||
                        trust?.nonce !== expectedTrust.nonce ||
                        trust?.fingerprint !== expectedTrust.fingerprint ||
                        trust?.codecId !== expectedTrust.codecId
                    ) {
                        throw new Error("The key trust state changed before it could be cleared.");
                    }
                }

                clear_pending_exchanges(storageKey);
                await clear_secret_key();
                await chrome.storage.local.remove(statusKey);
                sendResponse({ ok: true });
            })().catch((err) => sendResponse({ ok: false, error: err.message }));
            return true;
        }

        if (message.action === "send_confirmation") {
            send_verification_confirmation()
                .then(() => sendResponse({ ok: true }))
                .catch((err) => sendResponse({ ok: false, error: err.message }));
            return true;
        }
    });
}
