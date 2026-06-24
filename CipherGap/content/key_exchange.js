// key_exchange.js — Diffie-Hellman key exchange protocol (messenger-agnostic)
// Enhanced with SAS verification, TOFU fingerprints, and stale exchange cleanup.

const EXCHANGE_START_PREFIX = "start exchange key:";
const EXCHANGE_ACK_PREFIX = "start exchange ack:";
const EXCHANGE_SAS_PREFIX = "cg-sas";
const EXCHANGE_TIMEOUT_MS = 5 * 60 * 1000;

// Sent as an encrypted CGP packet when a user confirms the SAS code,
// proving the key was successfully exchanged and verified from their side.
const CONFIRMATION_MESSAGE = "✅ I confirm the SAS code matches — key exchange verified from my side.";

const pending_exchanges = new Map();
let handled_exchange_nonces = new Set();
let nonces_loaded = false;
let nonces_load_promise = null;

// =========================
// Message builders
// =========================

function build_start_exchange_message(nonce, publicKeyB64) {
    return `${EXCHANGE_START_PREFIX} ${nonce}|${publicKeyB64}`;
}

function build_ack_exchange_message(nonce, publicKeyB64) {
    return `${EXCHANGE_ACK_PREFIX} ${nonce}|${publicKeyB64}`;
}

function build_sas_message(sas, fingerprint) {
    return `${EXCHANGE_SAS_PREFIX}|${sas}|${fingerprint}`;
}

// =========================
// Message detection
// =========================

function is_exchange_message(text) {
    if (!text) {
        return false;
    }
    const normalized = normalize_exchange_text(text);
    return (
        /^start exchange key:/i.test(normalized) ||
        /^start exchange ack:/i.test(normalized) ||
        /^cg-sas\|/i.test(normalized)
    );
}

function normalize_exchange_text(text) {
    return text
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\r\n]+/g, " ")
        .trim();
}

function parse_exchange_message(text) {
    const normalized = normalize_exchange_text(text);

    if (/^start exchange key:/i.test(normalized)) {
        const body = normalized.replace(/^start exchange key:\s*/i, "");
        const pipeIndex = body.indexOf("|");
        if (pipeIndex === -1) {
            return null;
        }
        return {
            type: "start",
            nonce: body.slice(0, pipeIndex).trim(),
            publicKeyB64: body.slice(pipeIndex + 1).trim()
        };
    }

    if (/^start exchange ack:/i.test(normalized)) {
        const body = normalized.replace(/^start exchange ack:\s*/i, "");
        const pipeIndex = body.indexOf("|");
        if (pipeIndex === -1) {
            return null;
        }
        return {
            type: "ack",
            nonce: body.slice(0, pipeIndex).trim(),
            publicKeyB64: body.slice(pipeIndex + 1).trim()
        };
    }

    // SAS messages are purely informational — no action needed in protocol
    if (/^cg-sas\|/.test(normalized)) {
        return { type: "sas" };
    }

    return null;
}

// =========================
// Pending exchange state
// =========================

function get_pending_key(storageKey, nonce) {
    return pending_exchanges.get(`${storageKey}:${nonce}`);
}

function set_pending_exchange(storageKey, nonce, data) {
    const key = `${storageKey}:${nonce}`;
    pending_exchanges.set(key, { ...data, storageKey, nonce, createdAt: Date.now() });

    setTimeout(() => {
        const entry = pending_exchanges.get(key);
        if (entry) {
            pending_exchanges.delete(key);
            // Also clean up the waiting status so it doesn't linger
            chrome.storage.local.remove(`exchange_status_${storageKey}`).catch(() => {});
            console.log("[CipherGap] Pending exchange expired:", key);
        }
    }, EXCHANGE_TIMEOUT_MS);
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
    handled_exchange_nonces.add(id);
    await save_handled_nonce(id);
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
async function verify_peer_fingerprint(storageKey, peerPublicKeyB64) {
    const fingerprint = await compute_key_fingerprint(peerPublicKeyB64);
    const stored = await get_peer_fingerprint(storageKey);

    if (!stored) {
        // First time seeing this peer — save fingerprint (TOFU: Trust On First Use)
        await save_peer_fingerprint(storageKey, fingerprint);
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

async function finalize_exchange(storageKey, privateKey, peerPublicKeyB64) {
    // TOFU check — warn if peer key changed
    const fpCheck = await verify_peer_fingerprint(storageKey, peerPublicKeyB64);
    if (!fpCheck.ok) {
        console.warn(
            "[CipherGap] ⚠️ Peer key fingerprint mismatch!",
            "Expected:", fpCheck.oldFingerprint,
            "Got:", fpCheck.fingerprint
        );
        // Still allow the exchange but surface the warning
    }

    const sharedSecret = await derive_shared_secret_string(privateKey, peerPublicKeyB64);
    const sas = await derive_sas(sharedSecret);

    await set_secret_key(sharedSecret);

    await chrome.storage.local.set({
        [`exchange_status_${storageKey}`]: {
            status: "complete",
            sas,
            fingerprint: fpCheck.fingerprint,
            fingerprintWarning: !fpCheck.ok,
            oldFingerprint: fpCheck.oldFingerprint ?? null,
            at: Date.now()
        }
    });

    // Send the SAS code as a chat message so both users can see and verify it
    const adapter = get_active_messenger_adapter();
    if (adapter) {
        const sasMessage = build_sas_message(sas, fpCheck.fingerprint);
        await adapter.send_message(sasMessage).catch((err) => {
            console.warn("[CipherGap] Could not send SAS message:", err);
        });
    }

    console.log("[CipherGap] Key exchange complete for", storageKey, "SAS:", sas);
    return { sharedSecret, sas, fingerprint: fpCheck.fingerprint, fingerprintWarning: !fpCheck.ok };
}

// =========================
// Incoming message handlers
// =========================

async function handle_incoming_start(parsed, storageKey) {
    if (await is_exchange_handled(storageKey, parsed.nonce, "start")) {
        return;
    }

    const existingPending = get_pending_key(storageKey, parsed.nonce);
    if (existingPending?.role === "initiator") {
        return;
    }

    // Clean up any stale exchange status before starting a new one
    await cleanup_stale_exchange_status(storageKey);

    await mark_exchange_handled(storageKey, parsed.nonce, "start");

    const adapter = get_active_messenger_adapter();
    if (!adapter) {
        return;
    }

    const session = await create_dh_session();
    set_pending_exchange(storageKey, parsed.nonce, {
        privateKey: session.privateKey,
        role: "responder",
        peerPublicKeyB64: parsed.publicKeyB64
    });

    const ackMessage = build_ack_exchange_message(parsed.nonce, session.publicKeyB64);
    await adapter.send_message(ackMessage);

    await finalize_exchange(storageKey, session.privateKey, parsed.publicKeyB64);
    pending_exchanges.delete(`${storageKey}:${parsed.nonce}`);
}

async function handle_incoming_ack(parsed, storageKey) {
    if (await is_exchange_handled(storageKey, parsed.nonce, "ack")) {
        return;
    }

    const pending = get_pending_key(storageKey, parsed.nonce);
    if (!pending || pending.role !== "initiator") {
        return;
    }

    await mark_exchange_handled(storageKey, parsed.nonce, "ack");

    await finalize_exchange(storageKey, pending.privateKey, parsed.publicKeyB64);
    pending_exchanges.delete(`${storageKey}:${parsed.nonce}`);
}

async function handle_incoming_exchange_message(text) {
    const parsed = parse_exchange_message(text);
    if (!parsed) {
        return;
    }

    // SAS messages are informational — no protocol action
    if (parsed.type === "sas") {
        return;
    }

    const storageKey = get_storage_key();

    if (parsed.type === "start") {
        await handle_incoming_start(parsed, storageKey);
    } else if (parsed.type === "ack") {
        await handle_incoming_ack(parsed, storageKey);
    }
}

// =========================
// Initiate exchange
// =========================

async function start_key_exchange() {
    const adapter = get_active_messenger_adapter();
    if (!adapter) {
        throw new Error("No supported messenger detected on this page.");
    }

    if (!adapter.is_in_chat?.()) {
        throw new Error("Open a chat first before exchanging keys.");
    }

    const storageKey = get_storage_key();

    // Clean up any previous stale exchange status
    await cleanup_stale_exchange_status(storageKey);

    const session = await create_dh_session();

    set_pending_exchange(storageKey, session.nonce, {
        privateKey: session.privateKey,
        role: "initiator"
    });

    await chrome.storage.local.set({
        [`exchange_status_${storageKey}`]: {
            status: "waiting",
            nonce: session.nonce,
            at: Date.now()
        }
    });

    const startMessage = build_start_exchange_message(session.nonce, session.publicKeyB64);
    await adapter.send_message(startMessage);

    // Mark our own start nonce as handled so that on page refresh, the
    // scanner doesn't see our old start message and re-respond to ourselves.
    await mark_exchange_handled(storageKey, session.nonce, "start");

    return { nonce: session.nonce, storageKey };
}

// =========================
// Verification confirmation
// =========================

// Called when the user confirms the SAS code. Encrypts a confirmation
// message with the current chat key and sends it as a CGP packet so the
// peer can see (and decrypt) that the exchange was verified from this side.
async function send_verification_confirmation() {
    const adapter = get_active_messenger_adapter();
    if (!adapter) {
        throw new Error("No supported messenger detected on this page.");
    }

    const secretKey = await get_secret_key();
    if (!secretKey) {
        throw new Error("No encryption key set for this chat.");
    }

    const encrypted = await encrypt_message(CONFIRMATION_MESSAGE, secretKey);
    const packet = build_ciphergap_packet(encrypted);
    await adapter.send_message(packet);

    console.log("[CipherGap] Verification confirmation sent for", get_storage_key());
}

// =========================
// Listener
// =========================

function init_key_exchange_listener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.action === "start_key_exchange") {
            start_key_exchange()
                .then((result) => sendResponse({ ok: true, ...result }))
                .catch((error) => sendResponse({ ok: false, error: error.message }));
            return true;
        }

        if (message.action === "get_chat_context") {
            const adapter = get_active_messenger_adapter();
            sendResponse({
                ok: true,
                inChat: adapter?.is_in_chat?.() ?? false,
                storageKey: get_storage_key(),
                messenger: adapter?.name ?? null
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

        if (message.action === "clear_key") {
            (async () => {
                const storageKey = get_storage_key();
                await clear_secret_key();
                await chrome.storage.local.remove(`exchange_status_${storageKey}`);
                await chrome.storage.local.remove(`peer_fp_${storageKey}`);
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

init_key_exchange_listener();
