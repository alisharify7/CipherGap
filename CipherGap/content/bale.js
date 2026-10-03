// bale.js

const BALE_MESSAGE_SCROLLER = "#message_list_scroller_id";
const BALE_CHAT_INPUT = "#editable-message-text";
const BALE_SEND_BUTTON = '[aria-label="send-button"]';
const BALE_MESSAGE_ITEM = '[data-sid][aria-label="message-item"]';
const BALE_MESSENGER_CONFIG = globalThis.CipherGapShared.messengers
    .definitions.bale;
const BALE_SHARED_PROTOCOL = globalThis.CipherGapShared.protocol;
const BALE_SHARED_CRYPTO = globalThis.CipherGapShared.crypto;
const BALE_SHARED_FILE_CRYPTO = globalThis.CipherGapShared.file_crypto;
const BALE_SHARED_ADAPTERS = globalThis.CipherGapShared.messenger_adapters;
const IS_BALE_HOST = BALE_MESSENGER_CONFIG.hostnames
    .includes(window.location.hostname);
const CIPHERGAP_INTERNAL_FILE_INPUT = "ciphergapInternalFileInput";
const BALE_LIFECYCLE_SELECTOR = [
    BALE_MESSAGE_SCROLLER,
    BALE_CHAT_INPUT,
    "#chat_footer",
    "#ciphergap-btn",
    "#ciphergap-toolbar"
].join(",");

// Flag: when true, sanitize_bale_input will skip stripping — prevents the
// sanitizer from eating exchange text while bale_send_message is using it.
let cg_sending = false;
let cg_notice_timeout = null;

function inject_ciphergap_content_styles() {
    if (document.getElementById("ciphergap-content-styles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "ciphergap-content-styles";
    style.textContent = `
        [data-ciphergap-message-notice][hidden] { display: none !important; }
        .ciphergap-action {
            appearance: none !important;
            box-sizing: border-box !important;
            min-block-size: 40px !important;
            margin: 0 !important;
            padding: 8px 12px !important;
            border: 1px solid #1b4945 !important;
            border-radius: 9px !important;
            background: #245d58 !important;
            box-shadow: none !important;
            color: #fff !important;
            cursor: pointer !important;
            font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            letter-spacing: normal !important;
            text-decoration: none !important;
            text-transform: none !important;
            transition: background-color .16s ease, border-color .16s ease, opacity .16s ease !important;
            white-space: nowrap !important;
        }
        #chat_footer .ciphergap-action {
            background: #245d58 !important; border-color: #245d58 !important;
            min-block-size: 34px !important; block-size: 34px !important;
            font-weight: 600 !important; border-radius: 8px !important;
        }
        .ciphergap-action:hover:not(:disabled) {
            border-color: #163e3b !important;
            background: #1b4945 !important;
        }
        .ciphergap-action:focus-visible {
            outline: 2px solid #f6c453 !important;
            outline-offset: 2px !important;
            box-shadow: 0 0 0 2px rgba(15, 23, 42, .5) !important;
        }
        .ciphergap-action:disabled {
            cursor: wait !important;
            opacity: .62 !important;
        }
        #chat_footer .ciphergap-send-controls {
            display: inline-flex;
            align-items: center;
        }
        #ciphergap-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 7px 10px;
            margin: 6px 10px;
            border-radius: 10px;
            background: rgba(248, 251, 250, .96);
            border-block-end: 1px solid rgba(128,128,128,.16);
            font: 600 11px/1.4 system-ui, sans-serif;
            color: #60716f;
            direction: inherit;
            flex-wrap: wrap;
            justify-content: flex-start;
        }
        #ciphergap-toolbar button {
            appearance: none;
            padding: 5px 8px;
            border: 1px solid rgba(128,128,128,.3);
            border-radius: 7px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font: inherit;
        }
        #ciphergap-security-status { margin-inline-end: auto; border-color: transparent !important; }
        #ciphergap-toolbar[data-enabled="false"] { opacity: .75; }
        #ciphergap-secure-files { color: #245d58 !important; }
        #ciphergap-toolbar button:hover:not(:disabled) { background: rgba(96,113,111,.09); }
        #ciphergap-toolbar button:disabled { opacity: .5; cursor: not-allowed; }
        #ciphergap-btn {
            flex: 0 0 auto !important;
            min-inline-size: 68px !important;
            block-size: 40px !important;
            margin-inline: 6px 2px !important;
            padding-inline: 12px !important;
            border-radius: 10px !important;
        }
        [data-ciphergap-protocol-raw="true"] {
            display: none !important;
        }
        .ciphergap-chat-card {
            box-sizing: border-box !important;
            position: static !important;
            display: grid !important;
            float: none !important;
            clear: both !important;
            inline-size: min(238px, 100%) !important;
            min-inline-size: 0 !important;
            max-inline-size: 100% !important;
            margin: 2px 0 !important;
            padding: 8px 10px !important;
            gap: 4px !important;
            border: 1px solid rgba(15, 23, 42, .15) !important;
            border-color: color-mix(in srgb, currentColor 18%, transparent) !important;
            border-inline-start-width: 3px !important;
            border-radius: 10px !important;
            background: rgba(255, 255, 255, .38) !important;
            background: color-mix(in srgb, currentColor 7%, transparent) !important;
            color: inherit !important;
            direction: ltr !important;
            text-align: start !important;
            white-space: normal !important;
            overflow: hidden !important;
            font: 500 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        .ciphergap-chat-card--exchange {
            --ciphergap-card-accent: #0f766e;
            border-inline-start-color: var(--ciphergap-card-accent) !important;
        }
        .ciphergap-chat-card--sas {
            --ciphergap-card-accent: #8a5b00;
            border-inline-start-color: var(--ciphergap-card-accent) !important;
        }
        @supports (color: color-mix(in srgb, red, blue)) {
            .ciphergap-chat-card--exchange {
                --ciphergap-card-accent: color-mix(in srgb, #0f766e 78%, currentColor);
            }
            .ciphergap-chat-card--sas {
                --ciphergap-card-accent: color-mix(in srgb, #b7791f 76%, currentColor);
            }
        }
        .ciphergap-chat-card__heading {
            display: flex !important;
            align-items: center !important;
            gap: 7px !important;
            min-inline-size: 0 !important;
            font: 700 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        .ciphergap-chat-card__mark {
            box-sizing: border-box !important;
            display: inline-grid !important;
            place-items: center !important;
            flex: 0 0 22px !important;
            inline-size: 22px !important;
            block-size: 22px !important;
            border-radius: 7px !important;
            background: rgba(15, 118, 110, .13) !important;
            background: color-mix(in srgb, var(--ciphergap-card-accent) 15%, transparent) !important;
            color: var(--ciphergap-card-accent) !important;
            font: 800 9px/1 system-ui, sans-serif !important;
            letter-spacing: 0 !important;
        }
        .ciphergap-chat-card--exchange .ciphergap-chat-card__mark {
            color: var(--ciphergap-card-accent) !important;
        }
        .ciphergap-chat-card--sas .ciphergap-chat-card__mark {
            color: var(--ciphergap-card-accent) !important;
        }
        .ciphergap-chat-card__code {
            display: block !important;
            max-inline-size: 100% !important;
            margin-block: 1px !important;
            overflow: hidden !important;
            color: inherit !important;
            font: 750 20px/1.25 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace !important;
            font-variant-numeric: tabular-nums !important;
            letter-spacing: .15em !important;
            white-space: nowrap !important;
            unicode-bidi: isolate !important;
        }
        .ciphergap-chat-card__meta {
            display: block !important;
            min-inline-size: 0 !important;
            max-inline-size: 100% !important;
            color: inherit !important;
            overflow-wrap: anywhere !important;
            font: 450 11px/1.38 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        .ciphergap-plaintext {
            display: block !important;
            white-space: pre-wrap !important;
        }
        .ciphergap-encrypted-details {
            margin-block-start: 6px !important;
            color: inherit !important;
            font: 500 11px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        .ciphergap-encrypted-details > summary {
            cursor: pointer !important;
        }
        .ciphergap-encrypted-details > code {
            display: block !important;
            margin-block-start: 4px !important;
            max-block-size: 140px !important;
            overflow: auto !important;
            overscroll-behavior: contain !important;
            overflow-wrap: anywhere !important;
            white-space: pre-wrap !important;
        }
        .ciphergap-decrypt-wrap {
            box-sizing: border-box !important;
            position: static !important;
            display: inline-flex !important;
            float: none !important;
            clear: none !important;
            margin-block-start: 6px !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
            pointer-events: auto !important;
        }
        .ciphergap-file-decrypt-wrap {
            box-sizing: border-box !important;
            display: grid !important;
            position: static !important;
            gap: 7px !important;
            inline-size: min(260px, 100%) !important;
            max-inline-size: 100% !important;
            margin-block-start: 7px !important;
            padding: 8px 10px !important;
            border: 1px solid rgba(15, 23, 42, .12) !important;
            border-color: color-mix(in srgb, currentColor 16%, transparent) !important;
            border-radius: 10px !important;
            background: rgba(255, 255, 255, .36) !important;
            background: color-mix(in srgb, currentColor 6%, transparent) !important;
            color: inherit !important;
            pointer-events: auto !important;
        }
        .ciphergap-file-decrypt-hint {
            display: block !important;
            color: inherit !important;
            font: 450 11px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        .ciphergap-decrypt-button,
        .ciphergap-file-decrypt-button {
            min-block-size: 40px !important;
            position: relative !important;
            z-index: 10 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            pointer-events: auto !important;
        }
        .ciphergap-file-decrypt-button[data-state="success"] {
            border-color: #1c633e !important;
            background: #237a4b !important;
        }
        .ciphergap-file-decrypt-button[data-state="error"] {
            border-color: #8f312c !important;
            background: #a93d36 !important;
        }
        #ciphergap-live-notice {
            position: fixed;
            inset-inline-end: 16px;
            bottom: 82px;
            z-index: 2147483647;
            max-width: min(340px, calc(100vw - 32px));
            padding: 10px 14px;
            border: 1px solid rgba(255, 255, 255, .16);
            border-radius: 10px;
            background: #23312b;
            box-shadow: 0 10px 28px rgba(15, 23, 42, .28);
            color: #f8fafc;
            font: 600 13px/1.45 system-ui, sans-serif;
        }
        #ciphergap-live-notice[data-kind="success"] { background: #245f43; }
        #ciphergap-live-notice[data-kind="warning"] { background: #77500e; }
        #ciphergap-live-notice[data-kind="error"] { background: #8f342e; }
        @media (prefers-color-scheme: dark) {
            .ciphergap-chat-card {
                border-color: rgba(255, 255, 255, .2) !important;
                border-color: color-mix(in srgb, currentColor 18%, transparent) !important;
                background: rgba(255, 255, 255, .06) !important;
                background: color-mix(in srgb, currentColor 7%, transparent) !important;
            }
        }
        @media (prefers-reduced-motion: reduce) {
            .ciphergap-action {
                transition-duration: .01ms !important;
            }
        }
        @media (forced-colors: active) {
            .ciphergap-chat-card,
            .ciphergap-file-decrypt-wrap {
                border: 1px solid CanvasText !important;
                border-inline-start-width: 3px !important;
                background: Canvas !important;
                color: CanvasText !important;
            }
            .ciphergap-action,
            .ciphergap-action:hover:not(:disabled),
            .ciphergap-file-decrypt-button[data-state="success"],
            .ciphergap-file-decrypt-button[data-state="error"] {
                forced-color-adjust: auto !important;
                border-color: ButtonText !important;
                background: ButtonFace !important;
                color: ButtonText !important;
            }
            .ciphergap-action:focus-visible {
                outline-color: Highlight !important;
                box-shadow: none !important;
            }
            #ciphergap-live-notice {
                border-color: CanvasText !important;
                background: Canvas !important;
                color: CanvasText !important;
            }
        }
    `;
    document.head?.appendChild(style);
}

function show_ciphergap_notice(message, kind = "info", durationMs = 5000) {
    inject_ciphergap_content_styles();

    let notice = document.getElementById("ciphergap-live-notice");
    if (!notice) {
        notice = document.createElement("div");
        notice.id = "ciphergap-live-notice";
        notice.setAttribute("aria-atomic", "true");
        document.body.appendChild(notice);
    }

    notice.setAttribute("role", kind === "error" ? "alert" : "status");
    notice.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    notice.dataset.kind = kind;
    notice.textContent = message;
    notice.hidden = false;

    clearTimeout(cg_notice_timeout);
    cg_notice_timeout = setTimeout(() => {
        notice.hidden = true;
    }, durationMs);
}

function inject_bale_security_toolbar() {
    const footer = document.getElementById("chat_footer");
    if (!footer || document.getElementById("ciphergap-toolbar")) return;
    const toolbar = document.createElement("div");
    toolbar.id = "ciphergap-toolbar";
    toolbar.dataset.ciphergapUi = "toolbar";
    const status = document.createElement("button");
    status.id = "ciphergap-security-status";
    status.type = "button";
    status.textContent = "CipherGap · Checking…";
    status.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "open_ciphergap" }).catch(() => {
            show_ciphergap_notice("Open CipherGap from the browser toolbar.", "info");
        });
    });
    const files = document.createElement("button");
    files.id = "ciphergap-secure-files";
    files.type = "button";
    files.textContent = "Encrypted file";
    files.disabled = true;
    files.addEventListener("click", () => choose_bale_secure_files().catch((error) => {
        show_ciphergap_notice(error.message, "error");
    }));
    const toggle = document.createElement("button");
    toggle.id = "ciphergap-chat-toggle";
    toggle.type = "button";
    toggle.addEventListener("click", async () => {
        const key = globalThis.CipherGapShared.storage_keys.chat_enabled(get_storage_key());
        const saved = await chrome.storage.local.get(key);
        await chrome.storage.local.set({ [key]: saved[key] === false });
    });
    toolbar.append(status, files, toggle);
    footer.prepend(toolbar);
    // The footer can arrive after the key cache has already resolved.
    refresh_cg_chat_cache(true).catch(() => {});
}

function update_bale_security_toolbar(trust, exchange) {
    const status = document.getElementById("ciphergap-security-status");
    if (status) {
        const label = !cg_cached_enabled ? "Paused" : exchange?.status === "incoming" ? "Review key request"
            : exchange?.status === "waiting" ? "Waiting for partner"
            : !cg_cached_key ? "Set up security"
            : trust?.state === "verified" ? "Verified"
            : trust?.state === "changed" ? "Identity changed · Review"
            : "Verify your key";
        status.textContent = `CipherGap · ${label}`;
        status.title = "Open chat security settings";
    }
    const files = document.getElementById("ciphergap-secure-files");
    if (files) files.disabled = !cg_cached_key || !cg_cached_enabled;
    const toggle = document.getElementById("ciphergap-chat-toggle");
    if (toggle) {
        toggle.textContent = cg_cached_chat_enabled ? "Pause chat" : "Enable chat";
        toggle.setAttribute("aria-pressed", String(cg_cached_chat_enabled));
    }
    const encrypt = document.getElementById("ciphergap-btn");
    if (encrypt) encrypt.hidden = !cg_cached_enabled;
    document.getElementById("ciphergap-toolbar")?.setAttribute("data-enabled", String(cg_cached_enabled));
}

async function choose_bale_secure_files() {
    const storageKey = get_storage_key();
    await refresh_cg_chat_cache();
    if (!get_current_chat_id() || !cg_cached_enabled || !cg_cached_key || storageKey !== get_storage_key()) {
        throw new Error("Set up a key for this chat before choosing secure files.");
    }
    const input = document.getElementById("chat_footer")?.querySelector('input[type="file"]');
    if (!input) throw new Error("Bale’s file picker is unavailable. Reopen the chat.");
    // Use Bale's native preview and upload flow, with our capture-phase
    // encryption already installed. No original bytes reach its change handler.
    intercept_file_selection(input);
    // A dedicated picker marks only this selection as encrypted. Canceling
    // cannot leave the ordinary Bale picker in encrypted mode.
    const picker = document.createElement("input");
    picker.type = "file";
    picker.multiple = true;
    picker.hidden = true;
    picker.dataset[CIPHERGAP_INTERNAL_FILE_INPUT] = "true";
    picker.addEventListener("change", () => {
        if (!picker.files.length) return picker.remove();
        secure_file_selections.set(input, storageKey);
        redispatch_file_selection(input, Array.from(picker.files), false);
        picker.remove();
    }, { once: true });
    picker.addEventListener("cancel", () => picker.remove(), { once: true });
    document.body.append(picker);
    picker.click();
}

function redispatch_file_selection(fileInput, files, encrypted = true) {
    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;

    cg_redispatching = encrypted;
    try {
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
        cg_redispatching = false;
    }
}

// =========================
// File upload interception
// =========================

// Track which file inputs we've already hooked so we don't double-wrap.
const hooked_file_inputs = new WeakSet();
const secure_file_selections = new WeakMap();
// Reentrancy guard: while we're re-dispatching an encrypted change event,
// our own listener must ignore it (otherwise infinite loop).
let cg_redispatching = false;

// Intercept file selection: when a user picks files through Bale's
// attachment menu, encrypt them as .cgpe if a chat key exists.
//
// This listener runs SYNCHRONOUSLY first: it grabs the original files,
// replaces the input's files with an empty list (so Bale's React handler
// that runs right after us sees nothing), then asynchronously encrypts and
// re-dispatches a change event carrying the encrypted files.
function intercept_file_selection(fileInput) {
    if (
        hooked_file_inputs.has(fileInput) ||
        fileInput.dataset[CIPHERGAP_INTERNAL_FILE_INPUT] === "true"
    ) {
        return;
    }
    hooked_file_inputs.add(fileInput);

    fileInput.addEventListener("change", async (event) => {
        // Ignore our own re-dispatched event
        if (cg_redispatching || !get_current_chat_id()) {
            return;
        }

        const files = fileInput.files;
        if (!files || files.length === 0) {
            return;
        }

        const intendedStorageKey = secure_file_selections.get(fileInput);
        secure_file_selections.delete(fileInput);
        if (!intendedStorageKey) return; // Native Bale attachments stay ordinary.

        // Synchronously snapshot the original files and clear the input so
        // Bale's subsequent handler sees an empty selection. We run in the
        // capture phase and stop propagation to fully suppress Bale's handler.
        const originalFiles = Array.from(files);

        const currentStorageKey = get_storage_key();
        const cacheMatchesCurrentChat =
            cg_cache_ready && cg_cached_storage_key === currentStorageKey;

        // Suppress Bale's handler for THIS event (capture phase + stopPropagation)
        event.stopImmediatePropagation();
        event.stopPropagation();

        // Clear the input immediately so nothing leaks the originals
        const emptyDt = new DataTransfer();
        fileInput.files = emptyDt.files;

        // Resolve a cold or invalidated cache after the original event has
        // been stopped. This prevents a fast selection after SPA navigation
        // from leaking a file with the previous chat's key.
        try {
            if (!cacheMatchesCurrentChat) {
                if (cg_cached_storage_key !== currentStorageKey) {
                    invalidate_cg_chat_cache(currentStorageKey);
                }
                await refresh_cg_chat_cache();
            }

            if (intendedStorageKey !== currentStorageKey || get_storage_key() !== currentStorageKey) {
                throw new Error("The active chat changed before encryption finished.");
            }

            const secretKey = cg_cached_key;
            if (!secretKey || !cg_cached_enabled) {
                throw new Error("Enable CipherGap and set up a chat key before sending encrypted files.");
            }

            const totalSelectedBytes = originalFiles.reduce(
                (total, file) => total + file.size,
                0
            );
            if (
                totalSelectedBytes >
                BALE_SHARED_FILE_CRYPTO.write_format.max_file_bytes
            ) {
                throw new Error(
                    `The selected files exceed CipherGap's ${BALE_SHARED_FILE_CRYPTO.get_cgpe_write_file_size_label()} combined safety limit.`
                );
            }

            const encryptedFiles = [];
            const fileCryptoKey = await BALE_SHARED_FILE_CRYPTO
                .derive_cgpe_write_key(secretKey);
            for (let i = 0; i < originalFiles.length; i++) {
                const encrypted = await BALE_SHARED_FILE_CRYPTO.encrypt_file(
                    originalFiles[i],
                    secretKey,
                    fileCryptoKey
                );
                encryptedFiles.push(encrypted);
            }

            if (!cg_cached_enabled || get_storage_key() !== currentStorageKey || cg_cached_key !== secretKey) {
                throw new Error("The chat or key changed while encrypting the attachment.");
            }

            // Put encrypted files back and re-dispatch a change event so
            // Bale's React handler picks them up.
            redispatch_file_selection(fileInput, encryptedFiles);

            show_ciphergap_notice(
                `${encryptedFiles.length} attachment${encryptedFiles.length === 1 ? "" : "s"} encrypted and ready to send.`,
                "success"
            );
        } catch (error) {
            console.error("[CipherGap] File encryption failed:", error);
            show_ciphergap_notice(
                `Attachment not sent: ${error.message}`,
                "error",
                7000
            );
        }
    }, true); // CAPTURE phase — runs before Bale's bubble-phase listener
}

// Per-chat runtime cache. File interception needs the raw key synchronously;
// message processing also reuses the auto-decrypt flag and derived CryptoKey.
let cg_cached_storage_key = null;
let cg_cached_key = null;
let cg_cached_enabled = true;
let cg_cached_chat_enabled = true;
let cg_cached_auto_decrypt = false;
let cg_cached_auto_files = false;
let cg_cached_message_key = null;
let cg_cache_ready = false;
let cg_cache_refresh_token = 0;
let cg_cache_refresh_promise = null;
let cg_cache_refresh_storage_key = null;

function invalidate_cg_chat_cache(storageKey = get_storage_key()) {
    cg_cache_refresh_token += 1;
    cg_cached_storage_key = storageKey;
    cg_cached_key = null;
    cg_cached_auto_decrypt = false;
    cg_cached_auto_files = false;
    cg_cached_message_key = null;
    cg_cache_ready = false;
}

async function refresh_cg_chat_cache(force = false) {
    const storageKey = get_storage_key();

    if (cg_cached_storage_key !== storageKey) {
        invalidate_cg_chat_cache(storageKey);
    }

    if (!force && cg_cache_ready) {
        return;
    }

    if (
        !force &&
        cg_cache_refresh_promise &&
        cg_cache_refresh_storage_key === storageKey
    ) {
        return cg_cache_refresh_promise;
    }

    const refreshToken = ++cg_cache_refresh_token;
    const autoDecryptKey = globalThis.CipherGapShared.storage_keys
        .auto_decrypt(storageKey);
    const autoFilesKey = globalThis.CipherGapShared.storage_keys.auto_files(storageKey);
    const trustKey = globalThis.CipherGapShared.storage_keys.key_trust(storageKey);
    const exchangeKey = globalThis.CipherGapShared.storage_keys.exchange_status(storageKey);
    cg_cache_refresh_storage_key = storageKey;

    const refreshPromise = (async () => {
        const keys = globalThis.CipherGapShared.storage_keys;
        const result = await chrome.storage.local.get([storageKey, autoDecryptKey, autoFilesKey, trustKey, exchangeKey, keys.enabled, keys.chat_enabled(storageKey)]);
        const secretKey = result[storageKey] ?? null;
        const messageKey = secretKey
            ? await BALE_SHARED_CRYPTO.derive_ciphergap_message_key(secretKey)
            : null;

        if (
            refreshToken !== cg_cache_refresh_token ||
            get_storage_key() !== storageKey
        ) {
            return;
        }

        cg_cached_storage_key = storageKey;
        cg_cached_key = secretKey;
        cg_cached_chat_enabled = result[keys.chat_enabled(storageKey)] !== false;
        cg_cached_enabled = result[keys.enabled] !== false && cg_cached_chat_enabled;
        cg_cached_auto_decrypt = cg_cached_enabled && Boolean(result[autoDecryptKey]);
        cg_cached_auto_files = cg_cached_enabled && Boolean(result[autoFilesKey]);
        cg_cached_message_key = messageKey;
        cg_cache_ready = true;
        update_bale_security_toolbar(result[trustKey], result[exchangeKey]);
        if (cg_cached_enabled && bale_observed_scroller) scan_bale_messages(bale_observed_scroller, bale_scan_generation).catch(() => {});
        if (!cg_cached_enabled) {
            bale_file_bridge_request?.cancel();
            document.querySelectorAll('[data-ciphergap-message-notice]').forEach(node => { node.hidden = false; });
            document.querySelectorAll(BALE_MESSAGE_ITEM).forEach(node => { delete node.dataset.ciphergapProcessed; });
            document.querySelectorAll(BALE_MESSAGE_ITEM).forEach(clear_stale_protocol_ui);
            document.querySelectorAll('[data-ciphergap-ui="file-action"], .ciphergap-decrypt-wrap').forEach(node => node.remove());
        }
    })();

    cg_cache_refresh_promise = refreshPromise;

    try {
        await refreshPromise;
    } finally {
        if (cg_cache_refresh_promise === refreshPromise) {
            cg_cache_refresh_promise = null;
            cg_cache_refresh_storage_key = null;
        }
    }
}

// Refresh only when the current chat's key or setting changes. Other local
// storage writes (nonces, fingerprints, other chats) no longer cause a read.
if (IS_BALE_HOST) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") {
            return;
        }

        const storageKey = get_storage_key();
        const autoDecryptKey = globalThis.CipherGapShared.storage_keys
            .auto_decrypt(storageKey);
        const keys = globalThis.CipherGapShared.storage_keys;
        if (changes[keys.enabled] || changes[keys.chat_enabled(storageKey)] || changes[storageKey] || changes[autoDecryptKey] || changes[keys.auto_files(storageKey)] || changes[keys.key_trust(storageKey)] || changes[keys.exchange_status(storageKey)]) {
            // A request that arrived while another consent prompt was open
            // must be reconsidered after that prompt is declined or cancelled.
            if (changes[keys.exchange_status(storageKey)]?.oldValue && !changes[keys.exchange_status(storageKey)].newValue && bale_observed_scroller) {
                bale_observed_scroller.querySelectorAll('[data-ciphergap-exchange-handled]').forEach((row) => {
                    delete row.dataset.ciphergapExchangeHandled;
                    schedule_bale_message_processing(row, storageKey);
                });
            }
            const chatKeyChanged = Boolean(changes[storageKey]);
            invalidate_cg_chat_cache(storageKey);
            refresh_cg_chat_cache(true)
                .then(() => {
                    if (cg_cached_enabled && bale_observed_scroller) scan_bale_messages(bale_observed_scroller, bale_scan_generation).catch(() => {});
                    if (chatKeyChanged && cg_cached_auto_decrypt && cg_cached_key) {
                        auto_decrypt_visible_messages().catch(() => {});
                    }
                })
                .catch(() => {});
        }
    });
}

function hook_file_inputs_in_node(node) {
    if (!(node instanceof HTMLElement)) {
        return;
    }

    if (node.tagName === "INPUT" && node.type === "file") {
        intercept_file_selection(node);
    }

    node.querySelectorAll?.('input[type="file"]').forEach(intercept_file_selection);
}

function normalize_message_text(text) {
    return text
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\r\n]+/g, "")
        .trim();
}

function is_ciphergap_ui_element(element) {
    return Boolean(element?.closest?.("[data-ciphergap-ui]"));
}

function get_deepest_matching_payload(messageElement, parseCandidate) {
    const matches = [];
    const candidates = messageElement.querySelectorAll("span, p, div, a, [dir]");

    for (const element of candidates) {
        if (
            element === messageElement ||
            is_ciphergap_ui_element(element) ||
            element.closest('[role="checkbox"]') ||
            element.closest('[data-testid="message-state-icon"]') ||
            element.closest("svg")
        ) {
            continue;
        }

        const parsed = parseCandidate(element.textContent ?? "");
        if (parsed) {
            matches.push({ element, ...parsed });
        }
    }

    if (matches.length === 0) {
        return null;
    }

    // Bale can split a payload across nested nodes. Prefer the deepest strict
    // match so only the real payload is hidden, never its bubble or timestamp.
    return matches.find(({ element }) =>
        !matches.some(({ element: other }) =>
            other !== element && element.contains(other)
        )
    ) ?? matches[matches.length - 1];
}

function find_exchange_protocol_payload(messageElement) {
    if (!BALE_SHARED_PROTOCOL.contains_exchange_marker(
        messageElement.textContent ?? ""
    )) {
        return null;
    }

    return get_deepest_matching_payload(
        messageElement,
        BALE_SHARED_PROTOCOL.parse_strict_exchange_message
    );
}

async function bale_send_message(text, { storageKey = get_storage_key(), preserveDraft = true } = {}) {
    if (IS_BALE_HOST) await refresh_cg_chat_cache();
    if (!cg_cached_enabled) throw new Error("CipherGap is paused.");
    if (storageKey !== get_storage_key()) throw new Error("The active chat changed before sending.");
    const input = document.querySelector(BALE_CHAT_INPUT);
    if (!input) {
        throw new Error("Bale chat input not found.");
    }

    const sendButton = document.querySelector(BALE_SEND_BUTTON);
    if (!sendButton) {
        throw new Error("Bale send button not found.");
    }

    if (cg_sending) throw new Error("A message is already being sent. Please try again.");
    const draft = input.textContent;
    let sent = false;
    // Block the sanitizer while we fill the input and click send.
    cg_sending = true;
    try {
        input.textContent = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await wait_for_main_thread();
        if (!cg_cached_enabled || storageKey !== get_storage_key() || !input.isConnected) throw new Error("The active chat changed or CipherGap was paused before sending.");
        const currentSendButton = document.querySelector(BALE_SEND_BUTTON);
        if (!currentSendButton) throw new Error("Bale send button is no longer available.");
        currentSendButton.click();
        sent = true;
        await new Promise((resolve) => setTimeout(resolve, 150));
    } finally {
        // Do not erase a newly typed draft or touch another chat after navigation.
        if (storageKey === get_storage_key() && input.isConnected && (!input.textContent || input.textContent === text)) {
            input.textContent = preserveDraft || !sent ? draft : "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        cg_sending = false;
    }
}

// Clear the chat input field (used after exchange success / SAS verification).
function clear_bale_input() {
    const input = document.querySelector(BALE_CHAT_INPUT);
    if (!input) {
        return false;
    }

    input.textContent = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
}

// Guard: strip any exchange/SAS text that may have lingered in the input.
// Called on input changes so a stray exchange payload never gets sent again.
function sanitize_bale_input() {
    if (!cg_cached_enabled || cg_sending) {
        return; // Skip — bale_send_message is actively using the input
    }

    const input = document.querySelector(BALE_CHAT_INPUT);
    if (!input) {
        return;
    }

    const text = normalize_message_text(input.textContent ?? "");
    if (BALE_SHARED_PROTOCOL.is_exchange_message(text)) {
        input.textContent = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        console.warn("[CipherGap] Stripped lingering exchange text from chat input.");
    }
}

function extract_bale_message_text(messageElement) {
    for (const span of messageElement.querySelectorAll("span")) {
        if (is_ciphergap_ui_element(span)) {
            continue;
        }
        const text = normalize_message_text(span.textContent ?? "");
        if (text) {
            return text;
        }
    }

    return normalize_message_text(messageElement.textContent ?? "");
}

// =========================
// Encrypt button
// =========================

function inject_encrypt_button_bale() {
    if (document.getElementById("ciphergap-btn")) {
        return;
    }

    const chatFooter = document.getElementById("chat_footer");
    if (!chatFooter) {
        return;
    }

    const sendControl = chatFooter.querySelector(BALE_SEND_BUTTON);
    if (!sendControl) {
        return;
    }

    const sendSlot = sendControl.closest("button") ?? sendControl;
    const buttonContainer = sendSlot.parentElement;
    if (!buttonContainer) {
        return;
    }

    // Bale's inline display:none still hides both controls for an empty draft.
    buttonContainer.classList.add("ciphergap-send-controls");

    const button = document.createElement("button");
    button.id = "ciphergap-btn";
    button.className = "ciphergap-action";
    button.type = "button";
    button.innerText = "Encrypt";
    button.setAttribute("aria-label", "Encrypt and send with CipherGap");
    button.title = "Encrypt and send with CipherGap";

    button.addEventListener("click", async () => {
        try {
            button.disabled = true;
            button.setAttribute("aria-busy", "true");
            button.setAttribute("aria-label", "Encrypting and sending with CipherGap");
            button.innerText = "Sending…";

            const input = document.querySelector(BALE_CHAT_INPUT);
            if (!input) {
                return;
            }

            const plainText = input.textContent?.trim();
            const storageKey = get_storage_key();
            if (!plainText) {
                return;
            }

            await refresh_cg_chat_cache();
            const secretKey = cg_cached_key;
            if (!secretKey || !cg_cached_enabled) {
                show_ciphergap_notice(
                    "No key is set for this chat. Open CipherGap to exchange or add one.",
                    "warning",
                    7000
                );
                return;
            }

            const encryptedMessage = await BALE_SHARED_CRYPTO.encrypt_message(
                plainText,
                secretKey,
                cg_cached_message_key
            );
            const finalMessage = BALE_SHARED_PROTOCOL
                .build_ciphergap_packet(encryptedMessage);
            if (!cg_cached_enabled || storageKey !== get_storage_key() || cg_cached_key !== secretKey) {
                throw new Error("The chat or key changed while encrypting the message.");
            }
            await bale_send_message(finalMessage, { storageKey, preserveDraft: false });
            show_ciphergap_notice("Encrypted message sent.", "success", 3000);
        } catch (error) {
            console.error("[CipherGap] Encrypt failed:", error);
            show_ciphergap_notice(
                "Message not sent because encryption failed. Please try again.",
                "error",
                7000
            );
        } finally {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            button.setAttribute("aria-label", "Encrypt and send with CipherGap");
            button.innerText = "Encrypt";
        }
    });
    buttonContainer.insertBefore(button, sendSlot);
}

function find_cgp_span(messageElement) {
    return get_deepest_matching_payload(messageElement, (text) => {
        const normalized = normalize_message_text(text);
        return BALE_SHARED_PROTOCOL.is_ciphergap_packet(normalized)
            ? { normalized }
            : null;
    })?.element ?? null;
}

function hide_ciphergap_message_notice(messageElement) {
    const existing = messageElement.querySelector('[data-ciphergap-message-notice]');
    if (existing) {
        if (!existing.hidden) existing.hidden = true;
        return;
    }
    const payload = get_deepest_matching_payload(messageElement, text => {
        if (!BALE_SHARED_PROTOCOL.is_ciphergap_packet(text)) return null;
        const notice = BALE_SHARED_PROTOCOL.find_ciphergap_notice(text);
        return notice ? { notice } : null;
    });
    if (!payload) return;

    // A Range preserves Bale's link and paragraph elements even when the
    // notice shares a text node with the ciphertext. No host class is needed.
    const walker = document.createTreeWalker(payload.element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let offset = 0;
    let startFound = false;
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const end = offset + node.length;
        if (!startFound && payload.notice.index < end) {
            range.setStart(node, payload.notice.index - offset);
            startFound = true;
        }
        const noticeEnd = payload.notice.index + payload.notice.length;
        if (startFound && noticeEnd <= end) {
            range.setEnd(node, noticeEnd - offset);
            const wrapper = document.createElement('span');
            wrapper.dataset.ciphergapMessageNotice = 'true';
            wrapper.dataset.ciphergapUi = 'message-notice';
            wrapper.hidden = true;
            wrapper.appendChild(range.extractContents());
            range.insertNode(wrapper);
            return;
        }
        offset = end;
    }
}

function extract_cgp_packet_text(messageElement) {
    const span = find_cgp_span(messageElement);
    if (!span) {
        return "";
    }

    let text = normalize_message_text(span.textContent ?? "");

    if (text.includes("---")) {
        text = text.split("---")[0].trim();
    }

    return BALE_SHARED_PROTOCOL.is_ciphergap_packet(text)
        ? BALE_SHARED_PROTOCOL.strip_ciphergap_notice(text) : "";
}

function replace_message_visual(messageElement, encryptedText, decryptedText) {
    const span = find_cgp_span(messageElement);
    if (!span) {
        return;
    }

    const notices = [...span.querySelectorAll('[data-ciphergap-message-notice]')];
    notices.forEach(node => node.remove());
    span.textContent = "";

    const plaintext = document.createElement("span");
    plaintext.className = "ciphergap-plaintext";
    plaintext.dir = "auto";
    plaintext.textContent = decryptedText;

    const encryptedDetails = document.createElement("details");
    encryptedDetails.className = "ciphergap-encrypted-details";

    const summary = document.createElement("summary");
    summary.textContent = "Encrypted message";

    const ciphertext = document.createElement("code");
    ciphertext.dir = "ltr";
    ciphertext.textContent = encryptedText;

    encryptedDetails.appendChild(summary);
    encryptedDetails.appendChild(ciphertext);
    span.appendChild(plaintext);
    span.appendChild(encryptedDetails);
    notices.forEach(node => span.appendChild(node));
}

function create_decrypt_button() {
    const button = document.createElement("button");
    button.className = "ciphergap-action ciphergap-decrypt-button";
    button.type = "button";
    button.innerText = "Decrypt";
    button.setAttribute("aria-label", "Decrypt this CipherGap message");
    return button;
}

function attach_decrypt_button(messageElement, decryptButton) {
    const cgpSpan = find_cgp_span(messageElement);
    const container = cgpSpan?.parentElement ?? messageElement;

    const wrapper = document.createElement("div");
    wrapper.className = "ciphergap-decrypt-wrap";
    wrapper.appendChild(decryptButton);
    container.appendChild(wrapper);
}

async function handle_decrypt_click(event, messageElement, decryptButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
        decryptButton.disabled = true;
        decryptButton.setAttribute("aria-busy", "true");
        await refresh_cg_chat_cache();
        if (!cg_cached_enabled) throw new Error("CipherGap is paused.");
        await decrypt_message_element(
            messageElement,
            cg_cached_key,
            cg_cached_message_key
        );
        decryptButton.remove();
    } catch (error) {
        console.error("[CipherGap] Decrypt failed:", error);
        decryptButton.innerText = "Try again";
        show_ciphergap_notice(
            "Could not decrypt this message. Check the chat key and try again.",
            "error",
            7000
        );
    } finally {
        decryptButton.disabled = false;
        decryptButton.removeAttribute("aria-busy");
    }
}

// Core decryption routine shared by manual click and auto-decrypt.
// Returns true on success, throws on failure.
async function decrypt_message_element(
    messageElement,
    providedSecretKey = null,
    cachedCryptoKey = null
) {
    const currentText = extract_cgp_packet_text(messageElement);
    if (!BALE_SHARED_PROTOCOL.is_ciphergap_packet(currentText)) {
        throw new Error("Could not read encrypted message from this bubble.");
    }

    const secretKey = providedSecretKey ?? await get_secret_key();
    if (!secretKey) {
        throw new Error("No encryption key set for this chat.");
    }

    const packet = BALE_SHARED_PROTOCOL.parse_ciphergap_packet(currentText);
    if (!packet?.data) {
        throw new Error("Invalid CipherGap packet format.");
    }

    const packetCryptoProfile = BALE_SHARED_PROTOCOL
        .get_ciphergap_packet_crypto_profile(currentText);
    if (!packetCryptoProfile) {
        throw new Error(
            "This CipherGap message uses an unsupported version or algorithm."
        );
    }
    const currentCryptoProfile = BALE_SHARED_CRYPTO
        .get_message_crypto_profile();
    const canReuseCachedKey =
        packetCryptoProfile.id === currentCryptoProfile.id;

    const decryptedText = await BALE_SHARED_CRYPTO.decrypt_message(
        packet.data,
        secretKey,
        canReuseCachedKey ? cachedCryptoKey : null,
        packetCryptoProfile
    );
    replace_message_visual(messageElement, currentText, decryptedText);
    messageElement.dataset.ciphergapDecrypted = "true";
    return true;
}

const bale_decrypt_queue = [];
const bale_decrypt_queued = new WeakSet();
let bale_decrypt_worker_running = false;

function wait_for_main_thread() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function queue_bale_message_decryption(messageElement, storageKey = get_storage_key()) {
    if (
        bale_decrypt_queued.has(messageElement) ||
        messageElement.dataset.ciphergapDecrypted === "true"
    ) {
        return;
    }

    bale_decrypt_queued.add(messageElement);
    bale_decrypt_queue.push({ messageElement, storageKey });
    drain_bale_decrypt_queue().catch((error) => {
        console.error("[CipherGap] Decrypt queue failed:", error);
    });
}

async function drain_bale_decrypt_queue() {
    if (bale_decrypt_worker_running) {
        return;
    }

    bale_decrypt_worker_running = true;
    try {
        while (bale_decrypt_queue.length > 0) {
            const { messageElement, storageKey } = bale_decrypt_queue.shift();
            try {
                if (
                    !messageElement.isConnected ||
                    storageKey !== get_storage_key() ||
                    messageElement.dataset.ciphergapDecrypted === "true"
                ) {
                    continue;
                }

                await refresh_cg_chat_cache();
                if (
                    cg_cached_storage_key !== storageKey ||
                    !cg_cached_key || !cg_cached_enabled
                ) {
                    throw new Error("No encryption key set for this chat.");
                }

                await decrypt_message_element(
                    messageElement,
                    cg_cached_key,
                    cg_cached_message_key
                );
                messageElement.querySelector(".ciphergap-decrypt-wrap")?.remove();
            } catch (error) {
                console.warn("[CipherGap] Auto-decrypt failed, falling back to button:", error);
                if (messageElement.isConnected && storageKey === get_storage_key()) {
                    attach_decrypt_button_to(messageElement);
                }
            } finally {
                bale_decrypt_queued.delete(messageElement);
            }

            // Keep large chat restores responsive instead of starting every
            // WebCrypto operation in the same task.
            await wait_for_main_thread();
        }
    } finally {
        bale_decrypt_worker_running = false;
        if (bale_decrypt_queue.length > 0) {
            drain_bale_decrypt_queue().catch(() => {});
        }
    }
}

function process_encrypted_bale_message(messageElement) {
    if (messageElement.dataset.ciphergapProcessed) {
        return;
    }

    const text = extract_cgp_packet_text(messageElement);
    if (
        !BALE_SHARED_PROTOCOL.is_ciphergap_packet(text) ||
        messageElement.dataset.ciphergapDecrypted === "true"
    ) {
        return;
    }

    messageElement.dataset.ciphergapProcessed = "true";
    const messageStorageKey = get_storage_key();

    // All messages share one in-flight cache refresh, avoiding one storage
    // read and one key import per bubble during the initial scan.
    refresh_cg_chat_cache().then(() => {
        if (
            !messageElement.isConnected ||
            messageStorageKey !== get_storage_key()
        ) {
            delete messageElement.dataset.ciphergapProcessed;
            return;
        }

        if (cg_cached_auto_decrypt && cg_cached_key) {
            queue_bale_message_decryption(messageElement, messageStorageKey);
        } else {
            attach_decrypt_button_to(messageElement);
        }
    }).catch((error) => {
        console.warn("[CipherGap] Could not load decrypt settings:", error);
        if (messageElement.isConnected && messageStorageKey === get_storage_key()) {
            attach_decrypt_button_to(messageElement);
        }
    });
}

// Creates and attaches a manual Decrypt button to a message element.
function attach_decrypt_button_to(messageElement) {
    if (
        messageElement.dataset.ciphergapDecrypted === "true" ||
        messageElement.querySelector(".ciphergap-decrypt-wrap")
    ) {
        return;
    }

    const decryptButton = create_decrypt_button();

    decryptButton.addEventListener(
        "click",
        (event) => handle_decrypt_click(event, messageElement, decryptButton),
        true
    );
    decryptButton.addEventListener(
        "mousedown",
        (event) => {
            event.stopPropagation();
            event.stopImmediatePropagation();
        },
        true
    );

    try {
        attach_decrypt_button(messageElement, decryptButton);
    } catch (error) {
        console.error("[CipherGap] Failed to attach decrypt button:", error);
    }
}

// When auto-decrypt is enabled, immediately decrypt all currently-visible
// encrypted messages that haven't been decrypted yet.
async function auto_decrypt_visible_messages() {
    const scroller = document.querySelector(BALE_MESSAGE_SCROLLER);
    if (!scroller) {
        return;
    }

    await refresh_cg_chat_cache(true);
    if (!cg_cached_key) {
        return;
    }

    const messageElements = Array.from(scroller.querySelectorAll(BALE_MESSAGE_ITEM));
    for (let index = 0; index < messageElements.length; index += 1) {
        const messageElement = messageElements[index];
        if (
            messageElement.dataset.ciphergapDecrypted === "true" ||
            !bind_bale_message_to_storage(
                messageElement,
                cg_cached_storage_key
            )
        ) {
            continue;
        }
        const text = extract_cgp_packet_text(messageElement);
        if (!BALE_SHARED_PROTOCOL.is_ciphergap_packet(text)) {
            continue;
        }

        queue_bale_message_decryption(messageElement, cg_cached_storage_key);
        if ((index + 1) % 25 === 0) {
            await wait_for_main_thread();
        }
    }
}

// =========================
// Encrypted file detection (receiving side)
// =========================

// Return the deepest filename/carrier that mentions a .cgpe attachment.
function find_cgpe_file_in_message(messageElement) {
    if (!BALE_SHARED_FILE_CRYPTO.contains_cgpe_filename(
        messageElement.textContent ?? ""
    )) {
        return null;
    }

    return get_deepest_matching_payload(messageElement, (text) => {
        const normalized = normalize_message_text(text);
        return BALE_SHARED_FILE_CRYPTO.contains_cgpe_filename(normalized)
            ? { normalized }
            : null;
    });
}

// Create a "Decrypt File" button for encrypted file attachments.
function create_file_decrypt_button() {
    const button = document.createElement("button");
    button.className = "ciphergap-action ciphergap-file-decrypt-button";
    button.type = "button";
    button.innerText = "Decrypt & download";
    button.setAttribute("aria-label", "Download and decrypt this CipherGap attachment");
    return button;
}

// Trigger a browser download of a decrypted file (Blob → download).
function download_decrypted_file(decrypted) {
    const blob = new Blob([decrypted.data], { type: decrypted.type });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = decrypted.name;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

// Decrypt a CGPE file from a Blob/ArrayBuffer and trigger download.
async function decrypt_and_download_file(
    encryptedBuffer,
    secretKey,
    statusButton,
    fileCryptoKey = null
) {
    const decrypted = await BALE_SHARED_FILE_CRYPTO.decrypt_cgpe(
        encryptedBuffer,
        secretKey,
        fileCryptoKey
    );
    download_decrypted_file(decrypted);
    if (statusButton) {
        statusButton.innerText = "Downloaded";
        statusButton.setAttribute("aria-label", "CipherGap file decrypted");
        statusButton.dataset.state = "success";
    }
    show_ciphergap_notice(`${decrypted.name} was decrypted and downloaded.`, "success");
}

// Fallback decrypt path: open a hidden file picker so the user can select
// the .cgpe file they downloaded via Bale's own دانلود button.
function choose_downloaded_cgpe_file(event, messageElement, decryptButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = BALE_SHARED_FILE_CRYPTO.get_cgpe_file_accept();
    fileInput.style.display = "none";
    fileInput.dataset[CIPHERGAP_INTERNAL_FILE_INPUT] = "true";
    fileInput.setAttribute("aria-hidden", "true");

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) {
            return;
        }

        const storageKey = get_storage_key();
        try {
            decryptButton.disabled = true;
            decryptButton.innerText = "Decrypting…";
            delete decryptButton.dataset.state;
            decryptButton.setAttribute("aria-busy", "true");
            decryptButton.setAttribute("aria-label", "Decrypting CipherGap file");

            await refresh_cg_chat_cache();
            const secretKey = cg_cached_key;
            if (!secretKey) {
                throw new Error("No encryption key set for this chat.\nSet a key or exchange keys first.");
            }

            const maxContainerBytes = BALE_SHARED_FILE_CRYPTO
                .get_cgpe_max_container_bytes();
            if (file.size > maxContainerBytes) {
                throw new Error(
                    `This encrypted file exceeds CipherGap's ${BALE_SHARED_FILE_CRYPTO.get_cgpe_max_file_size_label()} safety limit.`
                );
            }

            const encryptedBuffer = await file.arrayBuffer();
            if (storageKey !== get_storage_key()) throw new Error("The active chat changed before decryption.");
            await decrypt_and_download_file(
                encryptedBuffer,
                secretKey,
                decryptButton,
                cg_cached_message_key
            );
        } catch (error) {
            console.error("[CipherGap] File decrypt failed:", error);
            decryptButton.innerText = "Try again";
            decryptButton.setAttribute("aria-label", "CipherGap file decryption failed");
            decryptButton.dataset.state = "error";
            show_ciphergap_notice(
                `File decryption failed: ${error.message}`,
                "error",
                7000
            );
        } finally {
            decryptButton.disabled = false;
            decryptButton.removeAttribute("aria-busy");
            fileInput.remove();
        }
    }, { once: true });

    document.body.appendChild(fileInput);
    fileInput.click();
    // Clean up the hidden input shortly after
    setTimeout(() => fileInput.remove(), 60000);
}

let bale_file_download_chain = Promise.resolve();
let bale_file_bridge_request = null;
let bale_chat_opened_at = Date.now();
const bale_auto_file_attempts = new Set();

function request_bale_encrypted_file(messageElement, filename, storageKey) {
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        let retryTimer;
        let settled = false;
        const finish = (error, bytes) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            clearInterval(retryTimer);
            window.removeEventListener("message", onMessage);
            if (bale_file_bridge_request?.id === id) bale_file_bridge_request = null;
            window.postMessage({ source: "ciphergap-content", type: "cancel_file", id }, location.origin);
            error ? reject(error) : resolve(bytes);
        };
        const clickAttachment = () => {
            if (settled) return;
            if (storageKey !== get_storage_key() || !messageElement.isConnected) {
                finish(new Error("The active chat changed during file download."));
                return;
            }
            const carrier = find_cgpe_file_in_message(messageElement)?.element;
            const anchor = carrier?.closest("a, button");
            if (!anchor || !messageElement.contains(anchor)) {
                finish(new Error("Bale’s attachment download control is unavailable. Choose the downloaded file instead."));
                return;
            }
            // While loading, clicking the cancel/progress icon would abort the
            // native transfer. Retry only once Bale renders its document icon.
            const cached = Boolean(anchor.querySelector('img[alt="file"]'));
            if (!retryTimer || cached) {
                // Bale attaches handlers to the icon and filename children,
                // rather than to the enclosing link. These structural paths
                // stay independent of its generated style class names.
                const control = anchor.tagName === "A"
                    ? (cached ? carrier : anchor.firstElementChild?.firstElementChild)
                    : anchor;
                control?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            }
        };
        const onMessage = (event) => {
            if (event.source !== window || event.origin !== location.origin || event.data?.source !== "ciphergap-main" || event.data.id !== id) return;
            if (event.data.type === "file_ready") {
                clickAttachment();
                if (!settled && !retryTimer) retryTimer = setInterval(clickAttachment, 1500);
            }
            if (event.data.type === "file_bytes") {
                const bytes = event.data.bytes;
                if (!globalThis.CipherGapShared.encoding.is_array_buffer(bytes) || bytes.byteLength > BALE_SHARED_FILE_CRYPTO.get_cgpe_max_container_bytes()) {
                    finish(new Error("The downloaded file exceeds the safety limit or is invalid."));
                } else finish(null, bytes);
            }
        };
        const timeout = setTimeout(() => finish(new Error("Bale did not provide this file in time. Try again or choose the downloaded .cgpe file.")), 45000);
        bale_file_bridge_request = { id, storageKey, cancel: () => finish(new Error("The active chat changed during file download.")) };
        window.addEventListener("message", onMessage);
        window.postMessage({ source: "ciphergap-content", type: "read_file", id, filename, maxBytes: BALE_SHARED_FILE_CRYPTO.get_cgpe_max_container_bytes() }, location.origin);
    });
}

function download_bale_encrypted_file(messageElement, button, automatic = false) {
    const storageKey = get_storage_key();
    button.disabled = true;
    button.textContent = "Downloading…";
    button.setAttribute("aria-busy", "true");
    const job = bale_file_download_chain.catch(() => {}).then(async () => {
        if (storageKey !== get_storage_key() || !messageElement.isConnected) throw new Error("The active chat changed before downloading.");
        await refresh_cg_chat_cache();
        const secretKey = cg_cached_key;
        if (!secretKey || !cg_cached_enabled) throw new Error("Enable CipherGap and set up a chat key before decrypting attachments.");
        const payload = find_cgpe_file_in_message(messageElement);
        if (!payload) throw new Error("This attachment is no longer available.");
        const encrypted = await request_bale_encrypted_file(messageElement, payload.normalized, storageKey);
        if (storageKey !== get_storage_key() || secretKey !== cg_cached_key) throw new Error("The chat or key changed during download.");
        button.textContent = "Decrypting…";
        await decrypt_and_download_file(encrypted, secretKey, button, cg_cached_message_key);
        if (automatic) {
            const key = globalThis.CipherGapShared.storage_keys.downloaded_files(storageKey);
            const result = await chrome.storage.local.get(key);
            await chrome.storage.local.set({ [key]: [...(result[key] || []), messageElement.dataset.sid].slice(-100) });
        }
    }).catch((error) => {
        button.textContent = "Try again";
        button.dataset.state = "error";
        show_ciphergap_notice(error.message, "error", 7000);
    }).finally(() => {
        button.disabled = false;
        button.removeAttribute("aria-busy");
    });
    bale_file_download_chain = job;
    return job;
}

function handle_file_decrypt_click(event, messageElement, button) {
    event.preventDefault();
    event.stopImmediatePropagation();
    download_bale_encrypted_file(messageElement, button);
}

async function auto_receive_bale_file(messageElement, button) {
    const storageKey = get_storage_key();
    const sid = messageElement.dataset.sid;
    const sentAt = Number(messageElement.dataset.date);
    if (!Number.isFinite(sentAt) || sentAt < bale_chat_opened_at || !messageElement.querySelector('[aria-label="LeftBubble-icon"]') || bale_auto_file_attempts.has(sid)) return;
    // Bind before the first await, so repeated DOM mutations cannot queue it twice.
    bale_auto_file_attempts.add(sid);
    if (bale_auto_file_attempts.size > 1000) bale_auto_file_attempts.delete(bale_auto_file_attempts.values().next().value);
    await refresh_cg_chat_cache();
    if (!cg_cached_auto_files || !cg_cached_key || get_storage_key() !== storageKey) return;
    const key = globalThis.CipherGapShared.storage_keys.downloaded_files(storageKey);
    const result = await chrome.storage.local.get(key);
    if ((result[key] || []).includes(sid) || get_storage_key() !== storageKey) return;
    return download_bale_encrypted_file(messageElement, button, true);
}

// Attach a Decrypt File button next to the filename inside Bale's bubble.
function attach_file_decrypt_button(messageElement, filePayload) {
    if (!filePayload?.element?.parentElement) {
        return;
    }

    const signature = `cgpe:${filePayload.normalized}`;
    if (
        messageElement.dataset.ciphergapFileSignature === signature &&
        messageElement.querySelector('[data-ciphergap-ui="file-action"]')
    ) {
        return;
    }

    messageElement.querySelector('[data-ciphergap-ui="file-action"]')?.remove();
    messageElement.dataset.ciphergapFileSignature = signature;

    const decryptButton = create_file_decrypt_button();

    decryptButton.addEventListener(
        "click",
        (event) => handle_file_decrypt_click(event, messageElement, decryptButton),
        true
    );
    decryptButton.addEventListener(
        "mousedown",
        (event) => {
            event.stopPropagation();
            event.stopImmediatePropagation();
        },
        true
    );

    // Add a small instruction text above the button
    const hint = document.createElement("span");
    hint.className = "ciphergap-file-decrypt-hint";
    hint.innerText =
        "Encrypted attachment · decrypt directly from Bale.";
    hint.dir = "auto";

    const wrapper = document.createElement("span");
    wrapper.className = "ciphergap-file-decrypt-wrap";
    wrapper.dataset.ciphergapUi = "file-action";
    wrapper.appendChild(hint);
    wrapper.appendChild(decryptButton);
    const localButton = document.createElement("button");
    localButton.type = "button";
    localButton.textContent = "Choose downloaded file instead";
    localButton.style.cssText = "border:0;background:transparent;color:inherit;font:inherit;font-size:11px;text-decoration:underline;cursor:pointer;padding:4px";
    localButton.addEventListener("click", (event) => choose_downloaded_cgpe_file(event, messageElement, decryptButton));
    wrapper.appendChild(localButton);

    // The filename carrier gives us a semantic in-bubble anchor and avoids
    // Bale's generated class names and fragile parent-count traversal.
    const interactiveAttachment = filePayload.element.closest("a, button");
    const mountAnchor = interactiveAttachment && messageElement.contains(interactiveAttachment)
        ? interactiveAttachment
        : filePayload.element;
    mountAnchor.insertAdjacentElement("afterend", wrapper);
    auto_receive_bale_file(messageElement, decryptButton).catch(() => {});
}

// Scan a message element for .cgpe encrypted file attachments.
function process_cgpe_file_message(messageElement) {
    const filePayload = find_cgpe_file_in_message(messageElement);
    if (filePayload) {
        attach_file_decrypt_button(messageElement, filePayload);
        return;
    }

    messageElement.querySelector('[data-ciphergap-ui="file-action"]')?.remove();
    delete messageElement.dataset.ciphergapFileSignature;
}

// =========================
// Hide exchange protocol messages
// =========================

function create_chat_card_heading(title) {
    const heading = document.createElement("span");
    heading.className = "ciphergap-chat-card__heading";

    const mark = document.createElement("span");
    mark.className = "ciphergap-chat-card__mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "CG";

    const titleElement = document.createElement("span");
    titleElement.textContent = title;

    heading.append(mark, titleElement);
    return heading;
}

function create_exchange_chat_card(parsed, signature) {
    const isStart = parsed.type === "start";
    const card = document.createElement("span");
    card.className = "ciphergap-chat-card ciphergap-chat-card--exchange";
    card.dataset.ciphergapUi = "protocol";
    card.dataset.ciphergapProtocolKind = parsed.type;
    card.dataset.ciphergapProtocolSignature = signature;
    card.appendChild(create_chat_card_heading(
        isStart ? "Key exchange request" : "Key exchange response"
    ));

    const meta = document.createElement("span");
    meta.className = "ciphergap-chat-card__meta";
    meta.textContent = isStart
        ? "Open CipherGap to review this request."
        : "Open CipherGap to verify the code.";
    card.appendChild(meta);
    return card;
}

function create_sas_chat_card(parsed, signature) {
    const card = document.createElement("span");
    card.className = "ciphergap-chat-card ciphergap-chat-card--sas";
    card.dataset.ciphergapUi = "protocol";
    card.dataset.ciphergapProtocolKind = "sas";
    card.dataset.ciphergapProtocolSignature = signature;
    card.setAttribute("role", "group");
    card.appendChild(create_chat_card_heading("Verification code"));

    const code = document.createElement("span");
    code.className = "ciphergap-chat-card__code";
    code.dir = "ltr";
    code.setAttribute(
        "aria-label",
        BALE_SHARED_PROTOCOL.speak_protocol_digits(parsed.sas)
    );
    code.textContent = BALE_SHARED_PROTOCOL.format_protocol_digits(parsed.sas);
    card.appendChild(code);

    const compareHint = document.createElement("span");
    compareHint.className = "ciphergap-chat-card__meta";
    compareHint.textContent = "Compare this code in CipherGap.";
    card.appendChild(compareHint);

    const fingerprint = document.createElement("span");
    fingerprint.className = "ciphergap-chat-card__meta";
    fingerprint.dir = "ltr";
    fingerprint.textContent =
        `Key fingerprint · ${BALE_SHARED_PROTOCOL.format_protocol_fingerprint(parsed.fingerprint)}`;
    card.appendChild(fingerprint);
    return card;
}

function clear_legacy_protocol_row_styles(messageElement) {
    const border = messageElement.style.borderInlineStart;
    if (border.includes("34, 197, 94") || border.includes("#22c55e")) {
        messageElement.style.removeProperty("border-inline-start");
    }
    if (messageElement.style.paddingInlineStart === "10px") {
        messageElement.style.removeProperty("padding-inline-start");
    }
}

function hide_exchange_protocol_message(messageElement, payload) {
    const { element: rawPayload, parsed, signature } = payload;
    if (!rawPayload?.parentElement) {
        return false;
    }

    clear_legacy_protocol_row_styles(messageElement);
    rawPayload.hidden = true;
    rawPayload.setAttribute("aria-hidden", "true");
    rawPayload.dataset.ciphergapProtocolRaw = "true";

    // Remove components created by the previous outer-row renderer if the
    // page is upgraded without a full navigation.
    messageElement.querySelectorAll(
        ".ciphergap-exchange-notice, .ciphergap-sas-display"
    ).forEach((legacyCard) => legacyCard.remove());

    const existingCards = messageElement.querySelectorAll(
        '[data-ciphergap-ui="protocol"]'
    );
    for (const existing of existingCards) {
        if (existing.dataset.ciphergapProtocolSignature !== signature) {
            existing.remove();
        }
    }

    let card = [...existingCards].find(
        (existing) =>
            existing.dataset.ciphergapProtocolSignature === signature
    );
    if (!card) {
        card = parsed.type === "sas"
            ? create_sas_chat_card(parsed, signature)
            : create_exchange_chat_card(parsed, signature);
    }

    // The raw payload's parent is Bale's real text container. Mounting here
    // keeps the card inside the native bubble without generated class names.
    if (card.parentElement !== rawPayload.parentElement || card.previousElementSibling !== rawPayload) {
        rawPayload.insertAdjacentElement("afterend", card);
    }
    return true;
}

function clear_stale_protocol_ui(messageElement) {
    messageElement.querySelectorAll('[data-ciphergap-ui="protocol"]')
        .forEach((card) => card.remove());
    messageElement.querySelectorAll('[data-ciphergap-protocol-raw="true"]')
        .forEach((rawPayload) => {
            rawPayload.hidden = false;
            rawPayload.removeAttribute("aria-hidden");
            delete rawPayload.dataset.ciphergapProtocolRaw;
        });
    delete messageElement.dataset.ciphergapExchangeHandled;
    clear_legacy_protocol_row_styles(messageElement);
}

function process_bale_message(
    messageElement,
    expectedStorageKey = get_storage_key()
) {
    if (
        !cg_cached_enabled || !cg_cache_ready || !messageElement?.matches?.(BALE_MESSAGE_ITEM) ||
        !get_current_chat_id() ||
        expectedStorageKey !== get_storage_key() ||
        !bind_bale_message_to_storage(messageElement, expectedStorageKey)
    ) {
        return;
    }

    // Check for encrypted file attachments (.cgpe)
    process_cgpe_file_message(messageElement);

    const protocolPayload = find_exchange_protocol_payload(messageElement);
    if (protocolPayload) {
        hide_exchange_protocol_message(messageElement, protocolPayload);

        if (
            messageElement.dataset.ciphergapExchangeHandled !==
            protocolPayload.signature
        ) {
            messageElement.dataset.ciphergapExchangeHandled =
                protocolPayload.signature;
            const sentAt = Number(messageElement.dataset.date);
            const stale = Number.isFinite(sentAt) && Date.now() - sentAt > EXCHANGE_TIMEOUT_MS;
            (stale ? Promise.resolve() : handle_incoming_exchange_message(protocolPayload.protocolText))
                .catch((error) => {
                    if (
                        messageElement.dataset.ciphergapExchangeHandled ===
                        protocolPayload.signature
                    ) {
                        delete messageElement.dataset.ciphergapExchangeHandled;
                    }
                    console.warn(
                        "[CipherGap] Ignored an invalid key exchange message:",
                        error
                    );
                });
        }
        return;
    }

    clear_stale_protocol_ui(messageElement);

    hide_ciphergap_message_notice(messageElement);

    const text = extract_bale_message_text(messageElement);
    if (!text) {
        return;
    }

    if (BALE_SHARED_PROTOCOL.is_ciphergap_packet(text)) {
        process_encrypted_bale_message(messageElement);
    }
}

let bale_lifecycle_started = false;
let bale_lifecycle_observer = null;
let bale_lifecycle_timer = null;
let bale_message_observer = null;
let bale_observed_scroller = null;
let bale_observed_chat_input = null;
let bale_active_storage_key = null;
let bale_scan_generation = 0;
const BALE_MESSAGE_BINDING_LIMIT = 10000;
const bale_message_storage_bindings = new Map();
const bale_message_processing_queue = new Map();
let bale_message_processing_frame = null;
let bale_message_processing_timer = null;

function bind_bale_message_to_storage(messageElement, storageKey) {
    const sid = messageElement.getAttribute("data-sid");
    if (!sid || !storageKey) {
        return false;
    }

    const knownStorageKey = bale_message_storage_bindings.get(sid);
    if (knownStorageKey) {
        return knownStorageKey === storageKey;
    }

    bale_message_storage_bindings.set(sid, storageKey);
    if (bale_message_storage_bindings.size > BALE_MESSAGE_BINDING_LIMIT) {
        const oldestSid = bale_message_storage_bindings.keys().next().value;
        bale_message_storage_bindings.delete(oldestSid);
    }
    return true;
}

function flush_bale_message_processing_queue() {
    if (bale_message_processing_frame !== null) {
        cancelAnimationFrame(bale_message_processing_frame);
        bale_message_processing_frame = null;
    }
    if (bale_message_processing_timer !== null) {
        clearTimeout(bale_message_processing_timer);
        bale_message_processing_timer = null;
    }

    const queuedMessages = [...bale_message_processing_queue.entries()];
    bale_message_processing_queue.clear();
    queuedMessages.forEach(([messageElement, storageKey]) => {
        if (
            storageKey === get_storage_key() &&
            messageElement.isConnected &&
            messageElement.closest(BALE_MESSAGE_SCROLLER) === bale_observed_scroller &&
            bind_bale_message_to_storage(messageElement, storageKey)
        ) {
            process_bale_message(messageElement, storageKey);
        }
    });
}

function schedule_bale_message_processing(
    messageElement,
    storageKey = get_storage_key()
) {
    if (
        !cg_cached_enabled || !cg_cache_ready || !messageElement?.matches?.(BALE_MESSAGE_ITEM) ||
        !get_current_chat_id() ||
        storageKey !== get_storage_key() ||
        !bind_bale_message_to_storage(messageElement, storageKey)
    ) {
        return;
    }

    bale_message_processing_queue.set(messageElement, storageKey);
    if (bale_message_processing_frame === null) {
        // Run just before paint so a raw protocol payload does not flash while
        // still allowing Bale's incremental React render to finish first.
        bale_message_processing_frame = requestAnimationFrame(
            flush_bale_message_processing_queue
        );
        // requestAnimationFrame pauses in a background tab; keep a timer as a
        // fallback so messages are ready when that tab becomes visible again.
        bale_message_processing_timer = setTimeout(
            flush_bale_message_processing_queue,
            100
        );
    }
}

function schedule_messages_from_node(node, storageKey = get_storage_key()) {
    const element = node instanceof Element ? node : node.parentElement;
    if (!element || is_ciphergap_ui_element(element)) {
        return;
    }

    schedule_bale_message_processing(
        element.closest(BALE_MESSAGE_ITEM),
        storageKey
    );
    if (element.matches(BALE_MESSAGE_ITEM)) {
        schedule_bale_message_processing(element, storageKey);
    }
    element.querySelectorAll?.(BALE_MESSAGE_ITEM)
        .forEach((messageElement) =>
            schedule_bale_message_processing(messageElement, storageKey)
        );
}

async function scan_bale_messages(
    scroller,
    scanGeneration,
    storageKey = get_storage_key()
) {
    // Bale normally opens at the newest messages. Bind/process those first so
    // a rapid chat switch cannot leave the visible rows unassociated.
    const messageElements = Array.from(
        scroller.querySelectorAll(BALE_MESSAGE_ITEM)
    ).reverse();

    if (
        !get_current_chat_id() ||
        storageKey !== get_storage_key() ||
        scanGeneration !== bale_scan_generation ||
        scroller !== bale_observed_scroller ||
        !scroller.isConnected
    ) {
        return;
    }

    // Bind every discovered row before the first yield. Even if the user
    // switches chats between batches, an unprocessed old row cannot later be
    // mistaken for a message from the new storage key.
    [...messageElements].reverse().forEach((messageElement) => {
        bind_bale_message_to_storage(messageElement, storageKey);
    });

    for (let index = 0; index < messageElements.length; index += 25) {
        if (
            scanGeneration !== bale_scan_generation ||
            scroller !== bale_observed_scroller ||
            !scroller.isConnected ||
            storageKey !== get_storage_key()
        ) {
            return;
        }

        messageElements
            .slice(index, index + 25)
            .forEach((messageElement) =>
                process_bale_message(messageElement, storageKey)
            );
        await wait_for_main_thread();
    }
}

function observe_current_bale_scroller(scroller) {
    bale_message_observer?.disconnect();
    bale_message_observer = null;
    bale_observed_scroller = scroller;
    bale_scan_generation += 1;

    if (!scroller) {
        return;
    }

    bale_message_observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (is_ciphergap_ui_element(
                mutation.target instanceof Element
                    ? mutation.target
                    : mutation.target.parentElement
            )) {
                continue;
            }

            if (mutation.type === "characterData") {
                schedule_messages_from_node(mutation.target);
                continue;
            }

            if (mutation.type === "attributes") {
                schedule_messages_from_node(mutation.target);
                continue;
            }

            if (mutation.removedNodes.length > 0) {
                const targetElement = mutation.target instanceof Element
                    ? mutation.target
                    : mutation.target.parentElement;
                schedule_bale_message_processing(
                    targetElement?.closest?.(BALE_MESSAGE_ITEM)
                );
            }

            for (const node of mutation.addedNodes) {
                schedule_messages_from_node(node);
            }
        }
    });

    bale_message_observer.observe(scroller, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-sid", "aria-label"]
    });
    const scanGeneration = bale_scan_generation;
    // Protocol cards do not need the chat key, so scan immediately instead of
    // leaving raw public-key payloads visible while storage/WebCrypto resolve.
    scan_bale_messages(scroller, scanGeneration).catch(() => {});
    refresh_cg_chat_cache().catch(() => {});
}

function observe_current_bale_input(chatInput) {
    if (chatInput === bale_observed_chat_input) {
        return;
    }

    if (bale_observed_chat_input) {
        bale_observed_chat_input.removeEventListener("input", sanitize_bale_input);
        bale_observed_chat_input.removeEventListener("focus", sanitize_bale_input);
    }

    bale_observed_chat_input = chatInput;
    if (!chatInput) {
        return;
    }

    chatInput.dataset.ciphergapSanitized = "true";
    chatInput.addEventListener("input", sanitize_bale_input);
    chatInput.addEventListener("focus", sanitize_bale_input);
}

function reconcile_bale_lifecycle() {
    bale_lifecycle_timer = null;
    if (!IS_BALE_HOST) {
        return;
    }

    const storageKey = get_storage_key();
    const chatChanged = storageKey !== bale_active_storage_key;
    if (chatChanged) {
        bale_chat_opened_at = Date.now();
        bale_file_bridge_request?.cancel();
        bale_active_storage_key = storageKey;
        invalidate_cg_chat_cache(storageKey);
        refresh_cg_chat_cache().catch(() => {});
        cleanup_stale_exchange_status(storageKey).catch(() => {});
    }

    inject_bale_security_toolbar();
    inject_encrypt_button_bale();

    const chatInput = document.querySelector(BALE_CHAT_INPUT);
    observe_current_bale_input(chatInput);

    const scroller = document.querySelector(BALE_MESSAGE_SCROLLER);
    if (scroller !== bale_observed_scroller) {
        observe_current_bale_scroller(scroller);
    } else if (chatChanged && scroller) {
        const scanGeneration = ++bale_scan_generation;
        scan_bale_messages(scroller, scanGeneration).catch(() => {});
        refresh_cg_chat_cache().catch(() => {});
    }
}

function queue_bale_lifecycle_reconcile() {
    if (bale_lifecycle_timer !== null) {
        return;
    }

    bale_lifecycle_timer = setTimeout(reconcile_bale_lifecycle, 50);
}

function node_may_change_bale_lifecycle(node) {
    if (!(node instanceof Element)) {
        return false;
    }

    return node.matches(BALE_LIFECYCLE_SELECTOR) ||
        Boolean(node.querySelector(BALE_LIFECYCLE_SELECTOR));
}

function start_bale_lifecycle() {
    if (!IS_BALE_HOST || bale_lifecycle_started) {
        return;
    }
    bale_lifecycle_started = true;
    inject_ciphergap_content_styles();

    document.querySelectorAll('input[type="file"]').forEach(intercept_file_selection);

    bale_lifecycle_observer = new MutationObserver((mutations) => {
        let shouldReconcile = get_storage_key() !== bale_active_storage_key;

        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                hook_file_inputs_in_node(node);
                shouldReconcile ||= node_may_change_bale_lifecycle(node);
            });
            shouldReconcile ||= [...mutation.removedNodes]
                .some(node_may_change_bale_lifecycle);
            shouldReconcile ||= mutation.target instanceof Element &&
                Boolean(mutation.target.closest("#chat_footer"));
        }

        if (shouldReconcile) {
            queue_bale_lifecycle_reconcile();
        }
    });
    bale_lifecycle_observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("popstate", queue_bale_lifecycle_reconcile);
    window.addEventListener("hashchange", queue_bale_lifecycle_reconcile);
    reconcile_bale_lifecycle();
}

const bale_adapter = {
    hostnames: BALE_MESSENGER_CONFIG.hostnames,

    is_active() {
        return (
            IS_BALE_HOST &&
            Boolean(document.querySelector(BALE_CHAT_INPUT))
        );
    },

    is_in_chat(url = new URL(window.location.href)) {
        return Boolean(url.searchParams.get("uid"));
    },

    get_chat_storage_suffix(url) {
        return url.searchParams.get("uid");
    },

    send_message: bale_send_message,
    extract_message_text: extract_bale_message_text,
    inject_ui: inject_encrypt_button_bale,
    observe_messages: start_bale_lifecycle,
    auto_decrypt_visible_messages,
    clear_input: clear_bale_input
};

BALE_SHARED_ADAPTERS.register("bale", bale_adapter);
if (IS_BALE_HOST) {
    start_bale_lifecycle();
}
