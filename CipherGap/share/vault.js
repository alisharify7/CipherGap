// Optional app lock: chat keys are encrypted at rest with a key derived from
// a passphrase. The derived key lives only in the background worker's session
// storage (cleared when the browser closes) and is released to this
// extension's own pages and content scripts while the lock is open.
//
//   storage.local[chat]  = { cgv: 1, iv, ct }   (AES-256-GCM, AAD = chat name)
//   storage.local[app_lock] = { v:1, salt, iterations, check, autolock_minutes }
//   storage.local[vault_state] = { unlockedUntil }   (non-secret; drives UI)
(function (shared) {
    const enc = shared.encoding;
    const keys = shared.storage_keys;
    const ITERATIONS = 600000;
    const MIN_PASSPHRASE = 6;
    const CHECK_TEXT = "ciphergap-vault-ok";
    const STATE_KEY = "ciphergap_vault_state";
    const hostnames = Object.values(shared.messengers.definitions).flatMap(item => item.hostnames);

    function is_chat_key_name(name) {
        return typeof name === "string" && name.length < 256 && !/__/.test(name) &&
            !/[\s/\\?#\x00-\x1f]/.test(name) &&
            hostnames.some(host => name.startsWith(host + "_") && name.length > host.length + 1);
    }
    // Chat keys, plus the group membership record (holds a private key) and the
    // list of previous group keys, are encrypted at rest when the lock is on.
    function is_secret_name(name) {
        if (is_chat_key_name(name)) return true;
        const match = /^(.*)__(members|oldkeys)$/.exec(String(name));
        return Boolean(match) && is_chat_key_name(match[1]);
    }
    function is_wrapped(value) {
        return Boolean(value) && typeof value === "object" && value.cgv === 1 &&
            typeof value.iv === "string" && typeof value.ct === "string";
    }
    function locked_error() {
        const error = new Error("CipherGap is locked. Unlock it from the extension popup.");
        error.code = "VAULT_LOCKED";
        return error;
    }

    // The Android app has no background worker and already keeps every key in a
// Keystore-encrypted store, so the passphrase lock is a browser-only feature.
const has_background = () => !globalThis.CipherGapHost?.mobile && Boolean(globalThis.chrome?.runtime?.sendMessage && globalThis.chrome?.storage?.local);
    async function ask(message) {
        const response = await chrome.runtime.sendMessage({ ciphergapVault: true, ...message });
        if (!response?.ok) throw new Error(response?.error || "CipherGap background is unavailable.");
        return response;
    }

    let cachedKey = null; // { key: CryptoKey, until }
    async function unlocked_key() {
        if (cachedKey && cachedKey.until > Date.now()) return cachedKey.key;
        cachedKey = null;
        const response = await ask({ action: "key" });
        if (!response.key) return null;
        const key = await crypto.subtle.importKey("raw", enc.base64_to_bytes(response.key), "AES-GCM", false, ["encrypt", "decrypt"]);
        cachedKey = { key, until: response.until || Date.now() + 60000 };
        // Re-check often so a lock elsewhere takes effect quickly.
        cachedKey.until = Math.min(cachedKey.until, Date.now() + 5000);
        return key;
    }
    function forget() { cachedKey = null; }

    async function wrap(name, plaintext, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode_utf8("ciphergap-vault:1:" + name) }, key, enc.encode_utf8(plaintext));
        return { cgv: 1, iv: enc.bytes_to_base64(iv), ct: enc.bytes_to_base64(ct) };
    }
    async function unwrap(name, value, key) {
        try {
            const plain = await crypto.subtle.decrypt({
                name: "AES-GCM",
                iv: enc.base64_to_bytes(value.iv),
                additionalData: enc.encode_utf8("ciphergap-vault:1:" + name)
            }, key, enc.base64_to_bytes(value.ct));
            return enc.decode_utf8(plain);
        } catch {
            throw new Error("A saved key could not be decrypted with the app lock key.");
        }
    }

    async function settings() {
        if (!has_background()) return null;
        const stored = await chrome.storage.local.get(keys.app_lock);
        const value = stored[keys.app_lock];
        return value && value.v === 1 && typeof value.salt === "string" ? value : null;
    }

    async function status() {
        const config = await settings();
        if (!config) return { available: has_background(), enabled: false, unlocked: true, autolockMinutes: 0 };
        const state = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY];
        const unlocked = Number(state?.unlockedUntil) > Date.now();
        return { available: true, enabled: true, unlocked, until: state?.unlockedUntil ?? 0, autolockMinutes: config.autolock_minutes };
    }

    // storage.local.get that returns plaintext chat keys. Throws VAULT_LOCKED.
    async function get(names) {
        const list = Array.isArray(names) ? names : typeof names === "string" ? [names] : null;
        const result = await chrome.storage.local.get(list);
        let key; // resolved lazily
        for (const [name, value] of Object.entries(result)) {
            if (!is_wrapped(value)) continue;
            key ??= await unlocked_key();
            if (!key) throw locked_error();
            result[name] = await unwrap(name, value, key);
        }
        return result;
    }
    async function set(values) {
        const config = await settings();
        const out = {};
        let key;
        for (const [name, value] of Object.entries(values)) {
            if (config && is_secret_name(name) && typeof value === "string") {
                key ??= await unlocked_key();
                if (!key) throw locked_error();
                out[name] = await wrap(name, value, key);
            } else out[name] = value;
        }
        await chrome.storage.local.set(out);
    }

    async function derive(passphrase, salt, iterations) {
        const material = await crypto.subtle.importKey("raw", enc.encode_utf8(passphrase), "PBKDF2", false, ["deriveBits"]);
        return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256));
    }
    function check_passphrase(passphrase) {
        if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE || passphrase.length > 256) {
            throw new Error(`Use an app lock passphrase of at least ${MIN_PASSPHRASE} characters.`);
        }
    }

    async function open_with(passphrase, config) {
        const raw = await derive(passphrase, enc.base64_to_bytes(config.salt), config.iterations);
        const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
        try { if (await unwrap("check", config.check, key) !== CHECK_TEXT) throw new Error(); }
        catch { throw new Error("Incorrect passphrase."); }
        return { raw, key };
    }

    async function change_all_keys(transform) {
        const all = await chrome.storage.local.get(null);
        const updates = {};
        for (const [name, value] of Object.entries(all)) {
            if (!is_secret_name(name)) continue;
            const converted = await transform(name, value);
            if (converted !== undefined) updates[name] = converted;
        }
        return updates;
    }

    async function setup(passphrase, autolockMinutes = 15) {
        check_passphrase(passphrase);
        if (await settings()) throw new Error("App lock is already on.");
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const raw = await derive(passphrase, salt, ITERATIONS);
        const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
        const updates = await change_all_keys(async (name, value) => typeof value === "string" ? wrap(name, value, key) : undefined);
        const minutes = Number.isInteger(autolockMinutes) && autolockMinutes >= 0 ? autolockMinutes : 15;
        const until = await ask({ action: "open", key: enc.bytes_to_base64(raw), minutes }).then(r => r.until);
        // One write: keys, settings and unlocked state become visible together.
        await chrome.storage.local.set({
            ...updates,
            [keys.app_lock]: { v: 1, salt: enc.bytes_to_base64(salt), iterations: ITERATIONS, autolock_minutes: minutes, check: await wrap("check", CHECK_TEXT, key) },
            [STATE_KEY]: { unlockedUntil: until }
        });
        forget();
    }

    async function unlock(passphrase) {
        const config = await settings();
        if (!config) return;
        const state = (await chrome.storage.local.get("ciphergap_vault_fails")).ciphergap_vault_fails ?? { count: 0, next: 0 };
        if (state.next > Date.now()) throw new Error(`Too many attempts. Try again in ${Math.ceil((state.next - Date.now()) / 1000)} seconds.`);
        let opened;
        try { opened = await open_with(passphrase, config); }
        catch (error) {
            const count = state.count + 1;
            await chrome.storage.local.set({ ciphergap_vault_fails: { count, next: Date.now() + Math.min(60000, 1000 * 2 ** Math.min(count, 6)) } });
            throw error;
        }
        await chrome.storage.local.remove("ciphergap_vault_fails");
        const until = await ask({ action: "open", key: enc.bytes_to_base64(opened.raw), minutes: config.autolock_minutes }).then(r => r.until);
        await chrome.storage.local.set({ [STATE_KEY]: { unlockedUntil: until } });
        forget();
    }

    async function lock() {
        await ask({ action: "lock" });
        await chrome.storage.local.set({ [STATE_KEY]: { unlockedUntil: 0 } });
        forget();
    }

    // Extends the inactivity window after real user actions.
    async function touch() {
        const config = await settings();
        if (!config) return;
        const response = await ask({ action: "touch" }).catch(() => null);
        if (response?.until) await chrome.storage.local.set({ [STATE_KEY]: { unlockedUntil: response.until } });
    }

    async function set_autolock(minutes) {
        const config = await settings();
        if (!config || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw new Error("Invalid auto-lock time.");
        await chrome.storage.local.set({ [keys.app_lock]: { ...config, autolock_minutes: minutes } });
        await ask({ action: "minutes", minutes });
    }

    async function disable(passphrase) {
        const config = await settings();
        if (!config) return;
        const { key } = await open_with(passphrase, config);
        const updates = await change_all_keys(async (name, value) => is_wrapped(value) ? unwrap(name, value, key) : undefined);
        await chrome.storage.local.set(updates);
        await chrome.storage.local.remove([keys.app_lock, STATE_KEY, "ciphergap_vault_fails"]);
        await ask({ action: "lock" });
        forget();
    }

    shared.vault = Object.freeze({
        MIN_PASSPHRASE, STATE_KEY, is_chat_key_name, is_secret_name, is_wrapped, status, get, set, setup, unlock, lock,
        touch, set_autolock, disable, forget
    });
})(globalThis.CipherGapShared);
