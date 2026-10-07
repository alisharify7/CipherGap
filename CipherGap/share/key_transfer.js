// Portable backups and shared keys. This file is used unchanged on Android.
(function (shared) {
    const keys = shared.storage_keys, enc = shared.encoding;
    const MAX_BYTES = 1024 * 1024, ITERATIONS = 250000;
    const hosts = Object.values(shared.messengers.definitions).flatMap(m => m.hostnames);
    const globals = { [keys.enabled]: "boolean", [keys.ui_theme]: ["light", "dark"], [keys.ui_language]: ["fa", "en"] };
    function chat_id(id) {
        return typeof id === "string" && id.length < 256 && !/[\s/\\?#\x00-\x1f]/.test(id) &&
            hosts.some(host => id === host || id.startsWith(host + "_") && id.length > host.length + 1) &&
            !/__/.test(id);
    }
    function field(name) {
        if (Object.hasOwn(globals, name)) return {kind:"global", rule:globals[name]};
        for (const [prefix, kind] of [["key_trust_", "trust"], ["peer_fp_", "peer"]]) {
            if (name.startsWith(prefix) && chat_id(name.slice(prefix.length))) return {id:name.slice(prefix.length), kind};
        }
        for (const [suffix, kind] of [["__auto_decrypt", "boolean"], ["__auto_files", "boolean"], ["__enabled", "boolean"]]) {
            if (name.endsWith(suffix) && chat_id(name.slice(0,-suffix.length))) return {id:name.slice(0,-suffix.length), kind};
        }
        return chat_id(name) ? {id:name, kind:"key"} : null;
    }
    function valid_key(value) { return typeof value === "string" && value.length > 0 && enc.encode_utf8(value).length <= 4096; }
    function validate_value(value, f) {
        if (f.kind === "key") return valid_key(value);
        if (f.kind === "boolean" || f.rule === "boolean") return typeof value === "boolean";
        if (Array.isArray(f.rule)) return f.rule.includes(value);
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const allowed = f.kind === "peer" ? ["fingerprint", "at"] : ["state", "source", "fingerprint", "oldFingerprint", "nonce", "codecId", "at", "verifiedAt"];
        if (Object.keys(value).some(name => !allowed.includes(name))) return false;
        for (const [name, v] of Object.entries(value)) {
            if (["at","verifiedAt"].includes(name) && (!Number.isFinite(v) || v < 0)) return false;
            if (["fingerprint","oldFingerprint"].includes(name) && v !== null && (typeof v !== "string" || !/^[a-f\d]{8,64}$/i.test(v))) return false;
            if (["nonce","codecId"].includes(name) && (typeof v !== "string" || v.length > 128)) return false;
        }
        return f.kind === "peer" ? typeof value.fingerprint === "string" :
            ["verified","unverified","changed"].includes(value.state) && ["manual","exchange"].includes(value.source);
    }
    function validate(backup) {
        if (!backup || backup.format !== "ciphergap-backup" || backup.version !== 1 ||
            !["all","chat"].includes(backup.scope) || !backup.data || typeof backup.data !== "object" || Array.isArray(backup.data))
            throw new Error("Invalid or unsupported CipherGap backup.");
        const entries = Object.entries(backup.data);
        if (entries.length > 10000 || enc.encode_utf8(JSON.stringify(backup)).length > 750000) throw new Error("The backup exceeds the safety limit.");
        for (const [name, value] of entries) {
            const f = field(name);
            if (!f || !validate_value(value, f) || backup.scope === "chat" && (!chat_id(backup.chat) || f.id !== backup.chat))
                throw new Error("The backup contains invalid settings or keys.");
        }
        if (backup.scope === "chat" && !valid_key(backup.data[backup.chat])) throw new Error("No chat key is available to export.");
        return backup;
    }
    function snapshot(state, chat = null) {
        if (chat !== null && !chat_id(chat)) throw new Error("Open a supported chat first.");
        const data = {};
        for (const [name, value] of Object.entries(state)) {
            const f = field(name);
            if (f && (!chat || f.id === chat)) data[name] = value;
        }
        return validate({format:"ciphergap-backup", version:1, scope:chat ? "chat" : "all", ...(chat ? {chat} : {}), createdAt:new Date().toISOString(), data});
    }
    async function derive(password, salt) {
        if (typeof password !== "string" || password.length < 10 || password.length > 1024) throw new Error("Use a backup password of at least 10 characters.");
        const material = await crypto.subtle.importKey("raw", enc.encode_utf8(password), "PBKDF2", false, ["deriveKey"]);
        return crypto.subtle.deriveKey({name:"PBKDF2", salt, iterations:ITERATIONS, hash:"SHA-256"}, material, {name:"AES-GCM",length:256}, false, ["encrypt","decrypt"]);
    }
    async function seal(backup, password) {
        validate(backup);
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await derive(password, salt);
        const bytes = await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode_utf8("ciphergap-backup:1")}, key, enc.encode_utf8(JSON.stringify(backup)));
        return JSON.stringify({format:"ciphergap-encrypted-backup",version:1,kdf:"PBKDF2-SHA256",iterations:ITERATIONS,salt:enc.bytes_to_base64(salt),iv:enc.bytes_to_base64(iv),data:enc.bytes_to_base64(bytes)});
    }
    async function open(text, password) {
        if (typeof text !== "string" || enc.encode_utf8(text).length > MAX_BYTES) throw new Error("The backup exceeds the safety limit.");
        let envelope;
        try { envelope = JSON.parse(text); } catch { throw new Error("Invalid or unsupported CipherGap backup."); }
        if (!envelope || envelope.format !== "ciphergap-encrypted-backup" || envelope.version !== 1 || envelope.kdf !== "PBKDF2-SHA256" || envelope.iterations !== ITERATIONS ||
            ["salt","iv","data"].some(name => typeof envelope[name] !== "string" || !/^[A-Za-z\d+/]+={0,2}$/.test(envelope[name])))
            throw new Error("Invalid or unsupported CipherGap backup.");
        const salt = enc.base64_to_bytes(envelope.salt), iv = enc.base64_to_bytes(envelope.iv), bytes = enc.base64_to_bytes(envelope.data);
        if (salt.length !== 16 || iv.length !== 12 || bytes.length < 16) throw new Error("Invalid or unsupported CipherGap backup.");
        const key = await derive(password, salt);
        let plaintext;
        try { plaintext = await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:enc.encode_utf8("ciphergap-backup:1")}, key, bytes); }
        catch { throw new Error("Wrong password or damaged backup. Nothing was imported."); }
        try { return validate(JSON.parse(enc.decode_utf8(plaintext))); }
        catch { throw new Error("The backup contains invalid settings or keys."); }
    }
    function share_key(key) {
        if (!valid_key(key)) throw new Error("No chat key is available to export.");
        const packet = "ciphergap-key:1:" + enc.bytes_to_base64(enc.encode_utf8(key));
        if (packet.length > 1800) throw new Error("This key is too long for QR. Use a chat backup instead.");
        return packet;
    }
    function read_key(packet) {
        if (typeof packet !== "string" || packet.length > 1800 || !/^ciphergap-key:1:[A-Za-z\d+/]+={0,2}$/.test(packet.trim())) throw new Error("This is not a CipherGap key QR code.");
        const bytes = enc.base64_to_bytes(packet.trim().slice(16));
        const key = new TextDecoder("utf-8", {fatal:true}).decode(bytes);
        if (!valid_key(key)) throw new Error("This is not a CipherGap key QR code.");
        return key;
    }
    function plan_import(backup, target = null) {
        validate(backup);
        if (target !== null) {
            if (!chat_id(target) || backup.scope !== "chat") throw new Error("Choose a single-chat backup and open the destination chat.");
            return key_plan(backup.data[backup.chat], target);
        }
        const values = {...backup.data}, remove = [];
        const chats = Object.keys(values).filter(name => field(name)?.kind === "key");
        for (const id of chats) {
            remove.push(keys.exchange_status(id));
            if (!Object.hasOwn(values, keys.key_trust(id))) values[keys.key_trust(id)] = {state:"unverified",source:"manual",at:Date.now()};
        }
        return {values, remove, chats};
    }
    function key_plan(key, target) {
        if (!valid_key(key) || !chat_id(target)) throw new Error("Open a supported chat first.");
        return {values:{[target]:key,[keys.key_trust(target)]:{state:"unverified",source:"manual",at:Date.now()}},remove:[keys.exchange_status(target)],chats:[target]};
    }
    shared.key_transfer = Object.freeze({MAX_BYTES, snapshot, seal, open, validate, share_key, read_key, plan_import, key_plan});
})(globalThis.CipherGapShared);
