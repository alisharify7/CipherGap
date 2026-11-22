// group.js — secure group chats: invite, join, approve and key delivery.
// Protocol and cryptography live in share/group_protocol.js.

const GROUP_PROTOCOL = globalThis.CipherGapShared.group;
const GROUP_ECDH = globalThis.CipherGapShared.ecdh;
const GROUP_ADAPTERS = globalThis.CipherGapShared.messenger_adapters;
const GROUP_INVITE_MS = globalThis.CipherGapShared.timeouts.group_invite_ms;

let group_cache = { storageKey: null, session: null, hasKey: false, oldKeys: [] };

function group_session_name(storageKey = get_storage_key()) {
    return globalThis.CipherGapShared.storage_keys.group_session(storageKey);
}

async function refresh_group_cache() {
    const storageKey = get_storage_key();
    const name = group_session_name(storageKey);
    const stored = await chrome.storage.local.get([name, storageKey]);
    if (get_storage_key() !== storageKey) return;
    let session = stored[name] ?? null;
    if (session && Number(session.expiresAt) <= Date.now()) {
        await chrome.storage.local.remove(name);
        session = null;
    }
    let oldKeys = [];
    try {
        oldKeys = await read_group_old_keys(storageKey);
        // Old ratchet keys obey the same retention window as the current key.
        const { retention } = await group_ratchet_settings();
        let changed = false;
        oldKeys = await Promise.all(oldKeys.map(async (key) => {
            if (!globalThis.CipherGapShared.keyring.is_ratchet_secret(key)) return key;
            const advanced = await globalThis.CipherGapShared.keyring.ratchet_forward(key, retention);
            if (advanced) changed = true;
            return advanced ?? key;
        }));
        if (changed) await globalThis.CipherGapShared.vault.set({ [group_old_keys_name(storageKey)]: JSON.stringify(oldKeys) });
    } catch { oldKeys = []; }
    group_cache = { storageKey, session, hasKey: Boolean(stored[storageKey]), oldKeys };
    update_group_cards();
}

function group_members_name(storageKey = get_storage_key()) {
    return globalThis.CipherGapShared.storage_keys.group_members(storageKey);
}
// Membership and old keys are stored as JSON strings so the app lock can encrypt them.
async function read_group_membership(storageKey = get_storage_key()) {
    const name = group_members_name(storageKey);
    const value = (await globalThis.CipherGapShared.vault.get([name]))[name];
    try { return value ? JSON.parse(value) : null; } catch { return null; }
}
async function write_group_membership(storageKey, membership) {
    await globalThis.CipherGapShared.vault.set({ [group_members_name(storageKey)]: JSON.stringify(membership) });
}
function group_old_keys_name(storageKey = get_storage_key()) {
    return `${storageKey}__oldkeys`;
}
async function read_group_old_keys(storageKey = get_storage_key()) {
    const name = group_old_keys_name(storageKey);
    try { const list = JSON.parse((await globalThis.CipherGapShared.vault.get([name]))[name] ?? "[]"); return Array.isArray(list) ? list : []; } catch { return []; }
}
// Messages sent before a rotation stay readable with the key that protected them.
async function remember_previous_group_key(storageKey, previousKey) {
    if (!previousKey) return;
    const list = (await read_group_old_keys(storageKey)).filter((key) => key !== previousKey);
    list.unshift(previousKey);
    await globalThis.CipherGapShared.vault.set({ [group_old_keys_name(storageKey)]: JSON.stringify(list.slice(0, 8)) });
}
async function decrypt_with_previous_group_keys(packetText) {
    for (const key of group_cache.oldKeys ?? []) {
        try { return await CHAT_SHARED_CRYPTO.open_message(packetText, key); } catch { /* try the next key */ }
    }
    return null;
}

async function new_group_keys() {
    const pair = await GROUP_ECDH.generate_ecdh_keypair();
    return {
        publicKeyB64: await GROUP_ECDH.export_public_key_b64(pair.publicKey),
        privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey)
    };
}
function import_group_private_key(jwk) {
    return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}
function group_adapter(storageKey) {
    const adapter = GROUP_ADAPTERS.get_active();
    if (!adapter?.is_in_chat?.()) throw new Error("Open the group chat first.");
    if (storageKey !== get_storage_key()) throw new Error("The active chat changed. Try again.");
    return adapter;
}
function group_ratchet_settings() {
    const keys = globalThis.CipherGapShared.storage_keys;
    return chrome.storage.local.get([keys.forward_secrecy, keys.retention_days]).then(settings => ({
        forwardSecrecy: settings[keys.forward_secrecy] !== false,
        retention: Number(settings[keys.retention_days]) ||
            globalThis.CipherGapShared.formats.crypto.profiles.hkdf_aes_gcm_v2.default_retention_epochs
    }));
}

// Creator: make a new group key and publish an invitation.
async function start_group_invite() {
    const storageKey = get_storage_key();
    await require_ciphergap_enabled(storageKey);
    const adapter = group_adapter(storageKey);
    await refresh_group_cache();
    if (group_cache.session && Number(group_cache.session.expiresAt) > Date.now()) {
        throw new Error("A group invitation is already open. Cancel it before creating another.");
    }
    const statusKey = globalThis.CipherGapShared.storage_keys.exchange_status(storageKey);
    const exchange = (await chrome.storage.local.get(statusKey))[statusKey];
    if (["waiting", "incoming"].includes(exchange?.status)) throw new Error("Finish the current key exchange first.");

    const { forwardSecrecy, retention } = await group_ratchet_settings();
    const root = GROUP_PROTOCOL.generate_group_secret();
    const savedKey = forwardSecrecy
        ? (await globalThis.CipherGapShared.keyring.ratchet_forward(root, retention)) ?? root : root;
    const keys = await new_group_keys();
    const gid = GROUP_PROTOCOL.generate_group_id();
    const expiresAt = Date.now() + GROUP_INVITE_MS;
    const session = { role: "creator", gid, ...keys, expiresAt, approved: [], at: Date.now() };
    const name = group_session_name(storageKey);

    await chrome.storage.local.set({ [name]: session });
    try {
        await adapter.send_message(GROUP_PROTOCOL.build_invite(gid, keys.publicKeyB64, expiresAt), { storageKey });
    } catch (error) {
        await chrome.storage.local.remove(name);
        throw error;
    }
    // A new invitation starts a new group: remember who owns it and who joins.
    await write_group_membership(storageKey, { role: "creator", gid, publicKeyB64: keys.publicKeyB64, privateJwk: keys.privateJwk, members: {}, at: Date.now() });
    // The existing key is replaced only after the invitation was really sent.
    const trustKey = globalThis.CipherGapShared.storage_keys.key_trust(storageKey);
    await globalThis.CipherGapShared.vault.set({
        [storageKey]: savedKey,
        [trustKey]: { state: "unverified", source: "manual", at: Date.now() }
    });
    await chrome.storage.local.remove(statusKey);
    return { gid, expiresAt, storageKey };
}

async function cancel_group_invite() {
    await chrome.storage.local.remove(group_session_name());
    await refresh_group_cache();
    return {};
}

// Member: answer an invitation.
async function join_group(parsed, storageKey) {
    await require_ciphergap_enabled(storageKey);
    const adapter = group_adapter(storageKey);
    if (parsed.expiresAt <= Date.now()) throw new Error("This invitation has expired.");
    await refresh_group_cache();
    if (group_cache.session?.role === "creator" && group_cache.session.gid === parsed.gid) {
        throw new Error("This is your own invitation.");
    }
    const keys = await new_group_keys();
    const session = {
        role: "joiner", gid: parsed.gid, ...keys,
        fingerprint: await GROUP_ECDH.compute_key_fingerprint(keys.publicKeyB64),
        creatorPublicKeyB64: parsed.publicKeyB64,
        creatorFingerprint: await GROUP_ECDH.compute_key_fingerprint(parsed.publicKeyB64),
        expiresAt: parsed.expiresAt, at: Date.now()
    };
    const name = group_session_name(storageKey);
    await chrome.storage.local.set({ [name]: session });
    try {
        await adapter.send_message(GROUP_PROTOCOL.build_join(parsed.gid, keys.publicKeyB64, parsed.expiresAt), { storageKey });
    } catch (error) {
        await chrome.storage.local.remove(name);
        throw error;
    }
    await refresh_group_cache();
}

// Creator: approve one member by sealing the group key for them.
const group_approvals_in_flight = new Set();
async function approve_group_join(parsed, storageKey) {
    await require_ciphergap_enabled(storageKey);
    const adapter = group_adapter(storageKey);
    const name = group_session_name(storageKey);
    const session = (await chrome.storage.local.get(name))[name];
    if (session?.role !== "creator" || session.gid !== parsed.gid) throw new Error("Only the creator of this invitation can approve members.");
    if (session.expiresAt <= Date.now() || parsed.expiresAt !== session.expiresAt) throw new Error("This join request is not valid for your open invitation.");
    const fingerprint = await GROUP_ECDH.compute_key_fingerprint(parsed.publicKeyB64);
    if (session.approved.includes(fingerprint)) throw new Error("This member was already approved.");
    const id = `${storageKey}:${parsed.gid}:${fingerprint}`;
    if (group_approvals_in_flight.has(id)) throw new Error("This member is already being approved.");
    group_approvals_in_flight.add(id);
    try {
        const secret = (await globalThis.CipherGapShared.vault.get([storageKey]))[storageKey];
        if (!secret) throw new Error("This chat has no group key. Create a new invitation.");
        const sealed = await GROUP_PROTOCOL.seal_group_key(
            await import_group_private_key(session.privateJwk), parsed.publicKeyB64, session.gid, session.expiresAt, secret
        );
        await adapter.send_message(GROUP_PROTOCOL.build_key(session.gid, sealed.fingerprint, sealed.sealed, session.expiresAt), { storageKey });
        const membership = await read_group_membership(storageKey);
        if (membership?.role === "creator" && membership.gid === session.gid) {
            membership.members[fingerprint] = { publicKeyB64: parsed.publicKeyB64, alias: "", at: Date.now() };
            await write_group_membership(storageKey, membership);
        }
        const latest = (await chrome.storage.local.get(name))[name];
        if (latest?.gid === session.gid && !latest.approved.includes(fingerprint)) {
            latest.approved.push(fingerprint);
            await chrome.storage.local.set({ [name]: latest });
        }
    } finally { group_approvals_in_flight.delete(id); }
    await refresh_group_cache();
}

// Member: a key message addressed to our pending join request.
async function handle_group_key(parsed, storageKey) {
    const name = group_session_name(storageKey);
    const session = (await chrome.storage.local.get(name))[name];
    if (session?.role !== "joiner" || session.gid !== parsed.gid || session.fingerprint !== parsed.fingerprint) return;
    if (session.expiresAt <= Date.now() || parsed.expiresAt !== session.expiresAt) return;
    await require_ciphergap_enabled(storageKey);
    const secret = await GROUP_PROTOCOL.open_group_key(await import_group_private_key(session.privateJwk), session.creatorPublicKeyB64, parsed);
    const { forwardSecrecy, retention } = await group_ratchet_settings();
    const savedKey = forwardSecrecy
        ? (await globalThis.CipherGapShared.keyring.ratchet_forward(secret, retention)) ?? secret : secret;
    const keys = globalThis.CipherGapShared.storage_keys;
    const latest = (await chrome.storage.local.get(name))[name];
    if (latest?.gid !== session.gid) return;
    await globalThis.CipherGapShared.vault.set({
        [storageKey]: savedKey,
        [keys.key_trust(storageKey)]: { state: "unverified", source: "manual", fingerprint: session.creatorFingerprint, at: Date.now() }
    });
    await write_group_membership(storageKey, {
        role: "member", gid: session.gid, privateJwk: session.privateJwk, fingerprint: session.fingerprint,
        creatorPublicKeyB64: session.creatorPublicKeyB64, creatorFingerprint: session.creatorFingerprint,
        lastRekeyAt: 0, at: Date.now()
    });
    await chrome.storage.local.remove([name, keys.exchange_status(storageKey)]);
    show_ciphergap_notice("You joined the secure group. Messages from members now decrypt.", "success", 6000);
}

// Member: the creator sent a fresh key (rotation or after someone was removed).
async function handle_group_rekey(parsed, storageKey) {
    const membership = await read_group_membership(storageKey);
    if (membership?.role !== "member" || membership.gid !== parsed.gid || membership.fingerprint !== parsed.fingerprint) return;
    if (parsed.expiresAt <= membership.lastRekeyAt || parsed.expiresAt > Date.now() + 10 * 60 * 1000) return;
    await require_ciphergap_enabled(storageKey);
    const secret = await GROUP_PROTOCOL.open_group_key(await import_group_private_key(membership.privateJwk), membership.creatorPublicKeyB64, parsed);
    const { forwardSecrecy, retention } = await group_ratchet_settings();
    const savedKey = forwardSecrecy
        ? (await globalThis.CipherGapShared.keyring.ratchet_forward(secret, retention)) ?? secret : secret;
    const latest = await read_group_membership(storageKey);
    if (latest?.gid !== membership.gid || parsed.expiresAt <= latest.lastRekeyAt) return;
    await remember_previous_group_key(storageKey, (await globalThis.CipherGapShared.vault.get([storageKey]))[storageKey]);
    await globalThis.CipherGapShared.vault.set({ [storageKey]: savedKey });
    await write_group_membership(storageKey, { ...latest, lastRekeyAt: parsed.expiresAt });
    show_ciphergap_notice("The group key was updated by its creator.", "info", 6000);
}

// Creator: issue a new group key to every remaining member. Passing a
// fingerprint removes that member: they keep old messages but cannot read new ones.
async function rekey_group(removeFingerprint = null) {
    const storageKey = get_storage_key();
    await require_ciphergap_enabled(storageKey);
    const adapter = group_adapter(storageKey);
    const membership = await read_group_membership(storageKey);
    if (membership?.role !== "creator") throw new Error("Only the creator of this group can change its key.");
    const members = { ...membership.members };
    if (removeFingerprint) {
        if (!members[removeFingerprint]) throw new Error("That member is not in this group.");
        delete members[removeFingerprint];
    }
    const { forwardSecrecy, retention } = await group_ratchet_settings();
    const root = GROUP_PROTOCOL.generate_group_secret();
    const savedKey = forwardSecrecy
        ? (await globalThis.CipherGapShared.keyring.ratchet_forward(root, retention)) ?? root : root;
    const issuedAt = Date.now();
    const privateKey = await import_group_private_key(membership.privateJwk);
    const sealedFor = [];
    for (const [fingerprint, member] of Object.entries(members)) {
        const sealed = await GROUP_PROTOCOL.seal_group_key(privateKey, member.publicKeyB64, membership.gid, issuedAt, savedKey, "rekey");
        sealedFor.push(GROUP_PROTOCOL.build_rekey(membership.gid, sealed.fingerprint, sealed.sealed, issuedAt));
    }
    // Members first, then ourselves: a failed send must not strand the creator on a key nobody has.
    for (const message of sealedFor) await adapter.send_message(message, { storageKey });
    await remember_previous_group_key(storageKey, (await globalThis.CipherGapShared.vault.get([storageKey]))[storageKey]);
    await globalThis.CipherGapShared.vault.set({ [storageKey]: savedKey });
    await write_group_membership(storageKey, { ...membership, members, rekeyedAt: issuedAt });
    return { members: Object.keys(members).length, removed: Boolean(removeFingerprint) };
}

async function handle_group_action(message) {
    if (message.action === "start_group_invite") return start_group_invite();
    if (message.action === "cancel_group_invite") return cancel_group_invite();
    if (message.action === "rotate_group_key") return rekey_group(null);
    if (message.action === "remove_group_member") {
        if (!/^[A-F0-9]{8}$/.test(message.fingerprint ?? "")) throw new Error("Invalid member.");
        return rekey_group(message.fingerprint);
    }
    throw new Error("Unknown group action.");
}

// =========================
// In-chat cards
// =========================

function find_group_payload(messageElement) {
    if (!GROUP_PROTOCOL.contains_marker(messageElement.textContent ?? "")) return null;
    return get_deepest_matching_payload(messageElement, (text) => {
        const parsed = GROUP_PROTOCOL.parse(text);
        return parsed ? { parsed, signature: parsed.signature, protocolText: parsed.protocolText } : null;
    });
}

function group_card_heading(title) {
    const heading = document.createElement("span");
    heading.className = "ciphergap-chat-card__heading";
    const mark = document.createElement("span");
    mark.className = "ciphergap-chat-card__mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "CG";
    const text = document.createElement("span");
    text.textContent = title;
    heading.append(mark, text);
    return heading;
}

function create_group_card(parsed, signature) {
    const card = document.createElement("span");
    card.className = "ciphergap-chat-card ciphergap-chat-card--group";
    card.dataset.ciphergapUi = "group-card";
    card.dataset.ciphergapGroupType = parsed.type;
    card.dataset.ciphergapGroupId = parsed.gid;
    card.dataset.ciphergapProtocolSignature = signature;
    card.dataset.ciphergapExpiresAt = String(parsed.expiresAt);
    card.append(group_card_heading(
        parsed.type === "invite" ? "Secure group invitation"
            : parsed.type === "join" ? "Request to join the group"
            : parsed.type === "rekey" ? "Group key updated" : "Group key delivered"
    ));
    const meta = document.createElement("span");
    meta.className = "ciphergap-chat-card__meta";
    const detail = document.createElement("span");
    detail.className = "ciphergap-chat-card__meta";
    detail.dir = "ltr";
    card.append(meta, detail);
    const actions = document.createElement("span");
    actions.className = "ciphergap-chat-card__actions";
    actions.hidden = true;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ciphergap-action";
    actions.append(button);
    card.append(actions);

    const fingerprintSource = parsed.type === "key" || parsed.type === "rekey" ? Promise.resolve(parsed.fingerprint) : GROUP_ECDH.compute_key_fingerprint(parsed.publicKeyB64);
    fingerprintSource.then((fingerprint) => {
        card.dataset.ciphergapFingerprint = fingerprint;
        detail.textContent = `${parsed.type === "invite" ? "Creator" : "Member"} fingerprint · ${globalThis.CipherGapShared.protocol.format_protocol_fingerprint(fingerprint)}`;
        update_group_cards();
    }).catch(() => {});

    button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const storageKey = get_storage_key();
        if (card.dataset.ciphergapStorageKey !== storageKey) return;
        if (parsed.type === "invite" && group_cache.hasKey && card.dataset.ciphergapReplaceConfirmed !== "true") {
            card.dataset.ciphergapReplaceConfirmed = "true";
            update_group_cards();
            return;
        }
        button.disabled = true;
        try {
            if (parsed.type === "invite") await join_group(parsed, storageKey);
            else await approve_group_join(parsed, storageKey);
        } catch (error) {
            show_ciphergap_notice(error.message, "error", 7000);
        } finally {
            button.disabled = false;
            await refresh_group_cache().catch(() => {});
        }
    });
    return card;
}

function update_group_cards() {
    const now = Date.now();
    const { session, hasKey } = group_cache;
    for (const card of document.querySelectorAll('[data-ciphergap-ui="group-card"]')) {
        if (card.dataset.ciphergapStorageKey !== get_storage_key()) continue;
        const type = card.dataset.ciphergapGroupType;
        const gid = card.dataset.ciphergapGroupId;
        const expired = Number(card.dataset.ciphergapExpiresAt) <= now;
        const own = session?.gid === gid ? session : null;
        const meta = card.querySelector(".ciphergap-chat-card__meta");
        const actions = card.querySelector(".ciphergap-chat-card__actions");
        const button = actions.querySelector("button");
        let text = "";
        let label = "";
        if (type === "rekey") {
            text = "The group creator issued a new key to the remaining members.";
        } else if (type === "key") {
            text = own?.role === "joiner" && own.fingerprint === card.dataset.ciphergapFingerprint
                ? "Opening your group key…" : "Delivered to a member of this group.";
        } else if (expired) {
            text = type === "invite" ? "This invitation has expired." : "This request has expired.";
        } else if (type === "invite") {
            if (own?.role === "creator") text = `Your invitation is open. Approve members as they join (${own.approved.length} approved).`;
            else if (own?.role === "joiner") text = "Request sent. Waiting for the creator to approve you.";
            else {
                text = card.dataset.ciphergapReplaceConfirmed === "true"
                    ? "Joining replaces this chat's current key. Older messages may need the previous key."
                    : "Join only if you expect this invitation and trust its creator.";
                label = card.dataset.ciphergapReplaceConfirmed === "true" ? "Replace key and join" : "Join secure group";
            }
        } else if (type === "join") {
            const approved = own?.role === "creator" && own.approved.includes(card.dataset.ciphergapFingerprint);
            if (own?.role === "creator") {
                text = approved ? "Approved. This member received the group key." : "Approve only people you recognise in this group.";
                label = approved ? "" : "Approve member";
            } else text = "Waiting for the group creator to approve this member.";
        }
        if (card.dataset.ciphergapMetaText !== text) { meta.textContent = text; card.dataset.ciphergapMetaText = text; }
        actions.hidden = !label || !cg_cached_enabled;
        if (label && button.textContent !== label) button.textContent = label;
    }
}

function render_group_message(messageElement, payload) {
    const { element: raw, parsed, signature } = payload;
    if (!raw?.parentElement) return false;
    clear_legacy_protocol_row_styles(messageElement);
    raw.hidden = true;
    raw.setAttribute("aria-hidden", "true");
    raw.dataset.ciphergapProtocolRaw = "true";
    CHAT_UI.layout(messageElement, raw);
    let card = [...messageElement.querySelectorAll('[data-ciphergap-ui="group-card"]')]
        .find((existing) => existing.dataset.ciphergapProtocolSignature === signature);
    messageElement.querySelectorAll('[data-ciphergap-ui="group-card"]').forEach((existing) => {
        if (existing !== card) existing.remove();
    });
    card ??= create_group_card(parsed, signature);
    card.dataset.ciphergapStorageKey = get_storage_key();
    if (card.parentElement !== raw.parentElement || card.previousElementSibling !== raw) raw.insertAdjacentElement("afterend", card);
    update_group_cards();
    return true;
}

// Called once per rendered row from process_chat_message.
function handle_group_row(messageElement, payload) {
    render_group_message(messageElement, payload);
    if (messageElement.dataset.ciphergapGroupHandled === payload.signature) return;
    messageElement.dataset.ciphergapGroupHandled = payload.signature;
    if (payload.parsed.type === "rekey") {
        handle_group_rekey(payload.parsed, get_storage_key())
            .catch((error) => {
                delete messageElement.dataset.ciphergapGroupHandled;
                console.warn("[CipherGap] Group rekey not accepted:", error.message);
            });
    }
    if (payload.parsed.type === "key" && payload.parsed.expiresAt > Date.now()) {
        handle_group_key(payload.parsed, get_storage_key())
            .then(() => refresh_group_cache())
            .catch((error) => {
                delete messageElement.dataset.ciphergapGroupHandled;
                console.warn("[CipherGap] Group key not accepted:", error.message);
            });
    }
}

// chat_runtime.js loads after this file, so its constants are checked at call time.
const group_is_chat_host = () => typeof IS_CHAT_HOST !== "undefined" && IS_CHAT_HOST;
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !group_is_chat_host()) return;
    if (changes[group_session_name()] || changes[get_storage_key()]) refresh_group_cache().catch(() => {});
});
setInterval(() => {
    if (!group_is_chat_host()) return;
    if (group_cache.storageKey !== get_storage_key()) refresh_group_cache().catch(() => {});
    else update_group_cards();
}, 1000)?.unref?.();
