// Shared chat runtime: encryption, consent, attachments and lifecycle.
// Native DOM/transport details live in the small platform modules.

const CHAT_DOM = Object.values(globalThis.CipherGapShared.chat_platforms).find(
    platform => platform.hostnames.includes(window.location.hostname) && platform.supports_url(new URL(window.location.href))
) ?? globalThis.CipherGapShared.chat_platforms.bale;
const CHAT_MESSAGE_SCROLLER = CHAT_DOM.scroller_selector;
const CHAT_CHAT_INPUT = CHAT_DOM.input_selector;
const CHAT_SEND_BUTTON = CHAT_DOM.send_selector;
const CHAT_MESSAGE_ITEM = CHAT_DOM.message_selector;
const CHAT_MESSENGER_CONFIG = globalThis.CipherGapShared.messengers.definitions[CHAT_DOM.name];
const CHAT_SHARED_PROTOCOL = globalThis.CipherGapShared.protocol;
const CHAT_SHARED_CRYPTO = globalThis.CipherGapShared.crypto;
const CHAT_SHARED_FILE_CRYPTO = globalThis.CipherGapShared.file_crypto;
const CHAT_SHARED_ADAPTERS = globalThis.CipherGapShared.messenger_adapters;
const CHAT_UI = globalThis.CipherGapShared.chat_ui;
const IS_CHAT_HOST = CHAT_DOM.hostnames.includes(window.location.hostname) && CHAT_DOM.supports_url(new URL(window.location.href));
const CHAT_FLOATING_TOOLBAR = CHAT_DOM.toolbar_encrypt || globalThis.CipherGapHost?.mobile;
function chat_composer() {
    const composer = CHAT_DOM.composer();
    if (composer) composer.dataset.ciphergapComposer = "true";
    return composer;
}
function chat_read_input(input) { return CHAT_UI.read_editor(input); }
function chat_write_input(input, text) {
    if (CHAT_DOM.write_input) return CHAT_DOM.write_input(input, text);
    CHAT_UI.write_editor(input, text);
}
function chat_send_control() { return CHAT_DOM.send_control?.() ?? document.querySelector(CHAT_SEND_BUTTON); }
const CIPHERGAP_INTERNAL_FILE_INPUT = "ciphergapInternalFileInput";
const CHAT_LIFECYCLE_SELECTOR = [
    CHAT_MESSAGE_SCROLLER,
    CHAT_CHAT_INPUT,
    CHAT_DOM.lifecycle_selector,
    '[data-ciphergap-composer="true"]',
    "#ciphergap-btn",
    "#ciphergap-toolbar"
].filter(Boolean).join(",");

// Flag: when true, sanitize_chat_input will skip stripping — prevents the
// sanitizer from eating exchange text while chat_send_message is using it.
let cg_sending = false;
let cg_notice_timeout = null;
let chat_toolbar_composer = null;
let chat_toolbar_cleanup = null;
let chat_scroll_container = null;
let chat_scroll_geometry = null;

function reserve_chat_scroll_space(row = document.querySelector(CHAT_MESSAGE_ITEM), force = false) {
    const toolbar = document.getElementById("ciphergap-toolbar");
    if (!toolbar || !CHAT_FLOATING_TOOLBAR || (!force && chat_scroll_container?.contains(row))) return;
    const scroll = CHAT_UI.scroll_container(row);
    if (!scroll || (!force && scroll === chat_scroll_container)) return;
    const geometry = `${scroll.getBoundingClientRect().bottom}:${toolbar.getBoundingClientRect().top}:${scroll.clientWidth}:${toolbar.hidden}`;
    if (scroll === chat_scroll_container && geometry === chat_scroll_geometry) return;
    chat_scroll_geometry = geometry;
    const previousInset = parseFloat(scroll.style.getPropertyValue("--cg-scroll-extra")) || 0;
    const pinned = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 48 + previousInset;
    if (chat_scroll_container && chat_scroll_container !== scroll) delete chat_scroll_container.dataset.ciphergapScroll;
    chat_scroll_container = scroll;
    // Read the messenger's current padding without our additive rule. It can
    // change when the native draft grows; never freeze its own composer inset.
    delete scroll.dataset.ciphergapScroll;
    const nativePadding = parseFloat(getComputedStyle(scroll).paddingBottom) || 0;
    const extra = toolbar.hidden ? 0 : Math.max(0, scroll.getBoundingClientRect().bottom - toolbar.getBoundingClientRect().top - nativePadding);
    scroll.style.setProperty("--cg-native-scroll-padding", `${nativePadding}px`);
    scroll.style.setProperty("--cg-scroll-extra", `${extra}px`);scroll.dataset.ciphergapScroll = "true";
    // Native resize/scroll anchoring settles on the next frame as well.
    if (pinned) requestAnimationFrame(() => requestAnimationFrame(() => {if (scroll.isConnected) scroll.scrollTop = scroll.scrollHeight;}));
    // Eitaa applies its own bottom anchor after responsive layout settles.
    // Reconcile only the near-bottom inset, never a reader's older position.
    setTimeout(() => {
        if (scroll !== chat_scroll_container || geometry !== chat_scroll_geometry || !scroll.isConnected) return;
        const gap = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
        if (gap > 0 && gap < 48 + extra) scroll.scrollTop = scroll.scrollHeight;
    }, 150);
}

function show_ciphergap_notice(message, kind = "info", durationMs = 5000) {

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

function inject_chat_security_toolbar() {
    const footer = chat_composer();
    const existing = document.getElementById("ciphergap-toolbar");
    if (existing && footer === chat_toolbar_composer && footer?.isConnected) return;
    chat_toolbar_cleanup?.();existing?.remove();chat_toolbar_composer = footer;
    if (!footer) return;
    const toolbar = document.createElement("div");
    toolbar.id = "ciphergap-toolbar";
    toolbar.dataset.ciphergapUi = "toolbar";
    const status = document.createElement("button");
    status.id = "ciphergap-security-status";
    status.type = "button";
    const copy = document.createElement("span");copy.className = "ciphergap-status-copy";
    const brand = document.createElement("strong");brand.textContent = "CipherGap";
    const label = document.createElement("small");label.dataset.cgStatusLabel = "true";label.textContent = "Checking…";
    copy.append(brand, label);status.append(CHAT_UI.icon("lock"), copy);
    status.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "open_ciphergap" }).catch(() => {
            show_ciphergap_notice("Open CipherGap from the browser toolbar.", "info");
        });
    });
    const files = document.createElement("button");
    files.id = "ciphergap-secure-files";
    files.type = "button";
    CHAT_UI.button(files, "file", "Encrypted file");
    files.disabled = true;
    files.addEventListener("click", () => choose_chat_secure_files().catch((error) => {
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
    const media = document.createElement("button");media.type = "button";media.id = "ciphergap-media";
    CHAT_UI.button(media, "smile", "Emoji & stickers");media.disabled = true;
    media.addEventListener("click", open_chat_media_picker);
    const timer = document.createElement("button");timer.type = "button";timer.id = "ciphergap-timer";
    timer.addEventListener("click", cycle_message_timer);
    const search = document.createElement("button");search.type = "button";search.id = "ciphergap-search";
    CHAT_UI.button(search, "search", "Search messages", true);
    search.addEventListener("click", toggle_chat_search);
    toolbar.append(status, files, media, timer, search, toggle);
    if (CHAT_FLOATING_TOOLBAR) toolbar.dataset.ciphergapFloating = "true";
    // Teact updates native children by position. Keep our floating toolbar
    // outside its subtree so opening a file preview cannot corrupt the composer.
    (CHAT_FLOATING_TOOLBAR ? document.body : footer).append(toolbar);
    if (CHAT_FLOATING_TOOLBAR) {
        let frame = null;
        const anchor = CHAT_DOM.toolbar_anchor?.() ?? footer;
        const position = () => {frame = null;
            if (!toolbar.isConnected || !footer.isConnected) {chat_toolbar_cleanup?.();toolbar.remove();return;}
            const rect = anchor.getBoundingClientRect();
            const theme = CHAT_UI.theme(document.querySelector(CHAT_CHAT_INPUT));
            if (toolbar.dataset.ciphergapTheme !== theme) toolbar.dataset.ciphergapTheme = theme;
            toolbar.hidden = !get_current_chat_id() || !rect.width || !rect.height;
            toolbar.style.left = `${rect.left}px`;toolbar.style.width = `${rect.width}px`;
            toolbar.style.top = `${rect.top - toolbar.offsetHeight - 7}px`;
            const space = `${toolbar.offsetHeight + 6}px`;
            if (footer.style.getPropertyValue("--cg-toolbar-space") !== space) footer.style.setProperty("--cg-toolbar-space", space);
            toolbar.dataset.compact = String(toolbar.clientWidth < 510);
            reserve_chat_scroll_space(undefined, true);
        };
        const schedule = (event) => {
            // Scrolling the message history does not move the composer anchor.
            if (event?.type === "scroll" && event.target === chat_scroll_container) return;
            if (!frame) frame = requestAnimationFrame(position);
        };
        const resize = new ResizeObserver(schedule);resize.observe(toolbar);resize.observe(footer);resize.observe(anchor);
        const appearance = new MutationObserver(schedule);
        for (const root of [document.documentElement, document.body]) appearance.observe(root, {attributes:true,attributeFilter:["class", "style", "data-theme"]});
        window.addEventListener("resize", schedule);window.addEventListener("scroll", schedule, true);
        window.visualViewport?.addEventListener("resize", schedule);
        window.visualViewport?.addEventListener("scroll", schedule);
        chat_toolbar_cleanup = () => {resize.disconnect();appearance.disconnect();cancelAnimationFrame(frame);window.removeEventListener("resize", schedule);window.removeEventListener("scroll", schedule, true);window.visualViewport?.removeEventListener("resize", schedule);window.visualViewport?.removeEventListener("scroll", schedule);footer.style.removeProperty("--cg-toolbar-space");if(chat_scroll_container){delete chat_scroll_container.dataset.ciphergapScroll;chat_scroll_container=null;}};
        schedule();
    }
    // The footer can arrive after the key cache has already resolved.
    refresh_cg_chat_cache(true).catch(() => {});
}

function update_chat_security_toolbar(trust, exchange) {
    const status = document.getElementById("ciphergap-security-status");
    if (status) {
        const label = !cg_cached_enabled ? "Paused" : exchange?.status === "incoming" ? "Review key request"
            : exchange?.status === "waiting" ? "Waiting for partner"
            : cg_vault_locked ? "Locked · Unlock"
            : !cg_cached_key ? "Set up security"
            : trust?.state === "verified" ? "Verified"
            : trust?.state === "changed" ? "Identity changed · Review"
            : "Verify your key";
        status.querySelector('[data-cg-status-label]').textContent = label;
        status.dataset.state = trust?.state ?? "unverified";
        status.title = "Open chat security settings";
        status.setAttribute("aria-label", `CipherGap · ${label}`);
    }
    const files = document.getElementById("ciphergap-secure-files");
    if (files) files.disabled = !cg_cached_key || !cg_cached_enabled;
    const media = document.getElementById("ciphergap-media");
    if (media) media.disabled = !cg_cached_key || !cg_cached_enabled;
    const searchButton = document.getElementById("ciphergap-search");
    if (searchButton) searchButton.disabled = !cg_cached_key || !cg_cached_enabled;
    const timer = document.getElementById("ciphergap-timer");
    if (timer) {
        const option = MESSAGE_TIMER_OPTIONS.find(item => item.id === cg_cached_timer) ?? MESSAGE_TIMER_OPTIONS[0];
        CHAT_UI.button(timer, "timer", option.id === "off" ? "Self-destruct: off" : `Self-destruct: ${option.label}`, true);
        timer.disabled = !cg_cached_key || !cg_cached_enabled;
        timer.dataset.active = String(option.id !== "off");
        timer.setAttribute("aria-pressed", String(option.id !== "off"));
        timer.title = option.id === "off" ? "Self-destructing messages: off. Click to choose a timer." : `New messages self-destruct: ${option.label}. Click to change.`;
    }
    const toggle = document.getElementById("ciphergap-chat-toggle");
    if (toggle) {
        CHAT_UI.button(toggle, cg_cached_chat_enabled ? "pause" : "play", cg_cached_chat_enabled ? "Pause chat" : "Enable chat", true);
        toggle.setAttribute("aria-pressed", String(cg_cached_chat_enabled));
    }
    const encrypt = document.getElementById("ciphergap-btn");
    if (encrypt) encrypt.hidden = !cg_cached_enabled;
    document.getElementById("ciphergap-toolbar")?.setAttribute("data-enabled", String(cg_cached_enabled));
    const toolbar = document.getElementById("ciphergap-toolbar");
    if (toolbar) {toolbar.dataset.ciphergapTheme = CHAT_UI.theme(document.querySelector(CHAT_CHAT_INPUT));toolbar.hidden = !get_current_chat_id();}
}

function open_chat_media_picker() {
    const storageKey = get_storage_key(), secretKey = cg_cached_key;
    const input = document.querySelector(CHAT_CHAT_INPUT);
    if (!input || !cg_cached_enabled || !secretKey) return;
    const textInput = input.tagName === "TEXTAREA" || input.tagName === "INPUT";
    const start = input.selectionStart, end = input.selectionEnd;
    const selection = window.getSelection();
    const range = selection.rangeCount && input.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection.getRangeAt(0).cloneRange() : null;
    const valid = () => storageKey === get_storage_key() && cg_cached_enabled && secretKey === cg_cached_key && input.isConnected;
    globalThis.CipherGapShared.stickers.open_picker({theme:CHAT_UI.theme(input),
        insertEmoji(emoji) {
            if (!valid()) return;
            input.focus();
            if (textInput) input.setRangeText(emoji, start, end, "end");
            else {
                const caret = range ?? document.createRange();
                if (!range) {caret.selectNodeContents(input);caret.collapse(false);}
                caret.deleteContents();const text = document.createTextNode(emoji);caret.insertNode(text);caret.setStartAfter(text);caret.collapse(true);
                selection.removeAllRanges();selection.addRange(caret);
            }
            input.dispatchEvent(new InputEvent("input", {bubbles:true,inputType:"insertText",data:emoji}));
            return input;
        },
        async sendSticker(file) {
            const packed = await globalThis.CipherGapShared.stickers.pack(file);
            if (!valid()) throw new Error("The chat or key changed while preparing the sticker.");
            const native = await choose_native_chat_file_input(storageKey);
            if (!valid() || !native) throw new Error("The chat or key changed while preparing the sticker.");
            intercept_file_selection(native);
            await new Promise((resolve,reject)=>{secure_file_selections.set(native,{storageKey,resolve,reject});redispatch_file_selection(native,[packed],false)});
        }
    });
}

// Native pickers can be detached (Telegram). The MAIN bridge briefly mounts
// that one requested picker so capture-phase encryption runs before upload.
function choose_native_chat_file_input(storageKey) {
    if (CHAT_DOM.native_file_input) return Promise.resolve(CHAT_DOM.native_file_input());
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = setTimeout(() => finish(new Error("The file picker did not open. Try again.")), 5000);
        const finish = (error, input) => {
            clearTimeout(timer);
            window.removeEventListener("message", onMessage);
            window.postMessage({ source: "ciphergap-content", type: "cancel_picker", id }, location.origin);
            error ? reject(error) : resolve(input);
        };
        const onMessage = event => {
            if (event.source !== window || event.origin !== location.origin || event.data?.source !== "ciphergap-main" || event.data.id !== id) return;
            if (event.data.type === "picker_ready") {
                Promise.resolve().then(() => CHAT_DOM.trigger_file_picker()).catch(error => finish(error));
            }
            if (event.data.type === "picker_input") {
                const input = document.querySelector(`[data-ciphergap-picker-id="${id}"]`);
                if (!input || !cg_cached_enabled || storageKey !== get_storage_key()) return finish(new Error("The active chat changed before selecting files."));
                finish(null, input);
            }
        };
        window.addEventListener("message", onMessage);
        window.postMessage({ source: "ciphergap-content", type: "prepare_picker", id }, location.origin);
    });
}

async function choose_chat_secure_files() {
    const storageKey = get_storage_key();
    await refresh_cg_chat_cache();
    if (!get_current_chat_id() || !cg_cached_enabled || !cg_cached_key || storageKey !== get_storage_key()) {
        throw new Error("Set up a key for this chat before choosing secure files.");
    }
    const input = await choose_native_chat_file_input(storageKey);
    if (!input) throw new Error("The messenger’s file picker is unavailable. Reopen the chat.");
    // Use the messenger's native preview and upload flow, with our capture-phase
    // encryption already installed. No original bytes reach its change handler.
    intercept_file_selection(input);
    // A dedicated picker marks only this selection as encrypted. Canceling
    // cannot leave the ordinary messenger picker in encrypted mode.
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

// Intercept file selection: when a user picks files through the messenger's
// attachment menu, encrypt them as .cgpe if a chat key exists.
//
// This listener runs SYNCHRONOUSLY first: it grabs the original files,
// replaces the input's files with an empty list (so the messenger's React handler
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
        if (cg_redispatching) {
            return;
        }

        const files = fileInput.files;
        if (!files || files.length === 0) {
            return;
        }

        const selection = secure_file_selections.get(fileInput);
        const intendedStorageKey = typeof selection === "string" ? selection : selection?.storageKey;
        secure_file_selections.delete(fileInput);
        if (!intendedStorageKey) return; // Native Messenger attachments stay ordinary.

        // Synchronously snapshot the original files and clear the input so
        // the messenger's subsequent handler sees an empty selection. We run in the
        // capture phase and stop propagation to fully suppress the messenger's handler.
        const originalFiles = Array.from(files);

        const currentStorageKey = get_storage_key();
        const cacheMatchesCurrentChat =
            cg_cache_ready && cg_cached_storage_key === currentStorageKey;

        // Suppress the messenger's handler for THIS event (capture phase + stopPropagation)
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
                CHAT_SHARED_FILE_CRYPTO.write_format.max_file_bytes
            ) {
                throw new Error(
                    `The selected files exceed CipherGap's ${CHAT_SHARED_FILE_CRYPTO.get_cgpe_write_file_size_label()} combined safety limit.`
                );
            }

            const encryptedFiles = [];
            const fileCryptoKey = await CHAT_SHARED_FILE_CRYPTO
                .derive_cgpe_write_key(secretKey);
            for (let i = 0; i < originalFiles.length; i++) {
                const encrypted = await CHAT_SHARED_FILE_CRYPTO.encrypt_file(
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
            // the messenger's React handler picks them up.
            redispatch_file_selection(fileInput, encryptedFiles);
            selection?.resolve?.();

            show_ciphergap_notice(
                `${encryptedFiles.length} attachment${encryptedFiles.length === 1 ? "" : "s"} encrypted and ready to send.`,
                "success"
            );
        } catch (error) {
            selection?.reject?.(error);
            console.error("[CipherGap] File encryption failed:", error);
            show_ciphergap_notice(
                `Attachment not sent: ${error.message}`,
                "error",
                7000
            );
        }
    }, true); // CAPTURE phase — runs before the messenger's bubble-phase listener
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
let cg_cached_timer = "off";
let cg_cached_preview = false;
let cg_vault_locked = false;
let cg_cached_exchange_status = null;
let cg_cache_ready = false;
let cg_cache_refresh_token = 0;
let cg_cache_refresh_promise = null;
let cg_cache_refresh_storage_key = null;

function invalidate_cg_chat_cache(storageKey = get_storage_key()) {
    if (cg_cached_storage_key !== storageKey) reset_chat_message_views();
    cg_cache_refresh_token += 1;
    // A caller returning to the same chat must not reuse an invalidated read.
    // Its token is already stale, so let it finish without publishing state.
    cg_cache_refresh_promise = null;
    cg_cache_refresh_storage_key = null;
    cg_cached_storage_key = storageKey;
    cg_cached_key = null;
    cg_cached_auto_decrypt = false;
    cg_cached_auto_files = false;
    cg_cached_message_key = null;
    cg_cached_timer = "off";
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
        let result;
        try {
            result = await globalThis.CipherGapShared.vault.get([storageKey, autoDecryptKey, autoFilesKey, trustKey, exchangeKey, keys.enabled, keys.chat_enabled(storageKey), keys.message_timer(storageKey), keys.retention_days, keys.preview_before_send]);
            cg_vault_locked = false;
        } catch (error) {
            if (error?.code !== "VAULT_LOCKED") throw error;
            // Keys are encrypted and the app lock is closed: behave as if no
            // key is available and ask the user to unlock.
            cg_vault_locked = true;
            result = await chrome.storage.local.get([autoDecryptKey, autoFilesKey, trustKey, exchangeKey, keys.enabled, keys.chat_enabled(storageKey), keys.message_timer(storageKey)]);
        }
        const secretKey = result[storageKey] ?? null;
        cg_cached_preview = result[keys.preview_before_send] === true;
        cg_cached_timer = MESSAGE_TIMER_OPTIONS.some(item => item.id === result[keys.message_timer(storageKey)]) ? result[keys.message_timer(storageKey)] : "off";
        if (secretKey) maintain_forward_secrecy(storageKey, secretKey, result[keys.retention_days]).catch(() => {});
        const messageKey = secretKey
            ? await CHAT_SHARED_CRYPTO.derive_ciphergap_message_key(secretKey)
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
        cg_cached_exchange_status = result[exchangeKey] ?? null;
        cg_cache_ready = true;
        update_chat_security_toolbar(result[trustKey], result[exchangeKey]);
        if (cg_cached_enabled && chat_observed_scroller) scan_chat_messages(chat_observed_scroller, chat_scan_generation).catch(() => {});
        if (!cg_cached_enabled) {
            reset_chat_message_views();
            chat_file_bridge_request?.cancel();
            document.querySelectorAll('[data-ciphergap-message-notice], [data-ciphergap-link-preview]').forEach(node => { node.hidden = false; });
            document.querySelectorAll(CHAT_MESSAGE_ITEM).forEach(node => { delete node.dataset.ciphergapProcessed; });
            document.querySelectorAll(CHAT_MESSAGE_ITEM).forEach(clear_stale_protocol_ui);
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
if (IS_CHAT_HOST) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") {
            return;
        }

        const storageKey = get_storage_key();
        if (changes[globalThis.CipherGapShared.vault.STATE_KEY]) {
            globalThis.CipherGapShared.vault.forget();
            if (!(Number(changes[globalThis.CipherGapShared.vault.STATE_KEY].newValue?.unlockedUntil) > Date.now())) {
                // Locked: drop decrypted views and in-memory keys immediately.
                globalThis.CipherGapShared.keyring.forget_cached();
                reset_chat_message_views();
                invalidate_cg_chat_cache(storageKey);
            }
            refresh_cg_chat_cache(true).catch(() => {});
        }
        if (changes[globalThis.CipherGapShared.storage_keys.preview_before_send]) refresh_cg_chat_cache(true).catch(() => {});
        if (changes[globalThis.CipherGapShared.storage_keys.message_timer(storageKey)] ||
            changes[globalThis.CipherGapShared.storage_keys.retention_days]) {
            refresh_cg_chat_cache(true).catch(() => {});
        }
        const autoDecryptKey = globalThis.CipherGapShared.storage_keys
            .auto_decrypt(storageKey);
        const keys = globalThis.CipherGapShared.storage_keys;
        if (changes[keys.enabled] || changes[keys.chat_enabled(storageKey)] || changes[storageKey] || changes[autoDecryptKey] || changes[keys.auto_files(storageKey)] || changes[keys.key_trust(storageKey)] || changes[keys.exchange_status(storageKey)]) {
            // A request that arrived while another consent prompt was open
            // must be reconsidered after that prompt is declined or cancelled.
            if (changes[keys.exchange_status(storageKey)]?.oldValue && !changes[keys.exchange_status(storageKey)].newValue && chat_observed_scroller) {
                chat_observed_scroller.querySelectorAll('[data-ciphergap-exchange-handled]').forEach((row) => {
                    delete row.dataset.ciphergapExchangeHandled;
                    schedule_chat_message_processing(row, storageKey);
                });
            }
            const chatKeyChanged = Boolean(changes[storageKey]);
            if (chatKeyChanged) reset_chat_message_views();
            invalidate_cg_chat_cache(storageKey);
            refresh_cg_chat_cache(true)
                .then(() => {
                    if (cg_cached_enabled && chat_observed_scroller) scan_chat_messages(chat_observed_scroller, chat_scan_generation).catch(() => {});
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
    CHAT_DOM.prepare_message?.(messageElement);
    const matches = [];
    const root = CHAT_DOM.payload_root?.(messageElement) ?? messageElement;
    const candidates = [root, ...root.querySelectorAll("span, p, div, a, [dir]")];

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

        const metadata = [...element.querySelectorAll('[data-ciphergap-metadata], [data-ignore-on-paste="true"]')];
        let text = element.textContent ?? "";
        if (metadata.length) {
            const clone = element.cloneNode(true);
            clone.querySelectorAll('[data-ciphergap-metadata], [data-ignore-on-paste="true"]').forEach(node => node.remove());
            text = clone.textContent;
        }
        const parsed = parseCandidate(text);
        if (parsed) {
            matches.push({ element, ...parsed });
        }
    }

    if (matches.length === 0) {
        return null;
    }

    // Messengers can split a payload across nested nodes. Prefer the deepest strict
    // match so only the real payload is hidden, never its bubble or timestamp.
    const result = matches.filter(({ element }) =>
        !matches.some(({ element: other }) => other !== element && element.contains(other))
    ).at(-1) ?? matches[matches.length - 1];
    const metadata = [...result.element.querySelectorAll('[data-ciphergap-metadata], [data-ignore-on-paste="true"]')];
    if (metadata.length && metadata.every(node => node.parentElement === result.element)) {
        const carrier = document.createElement("span");
        carrier.dataset.ciphergapPayload = "true";
        for (const child of [...result.element.childNodes]) if (!metadata.includes(child)) carrier.append(child);
        result.element.prepend(carrier);
        result.element = carrier;
    }
    return result;
}

function find_exchange_protocol_payload(messageElement) {
    if (!CHAT_SHARED_PROTOCOL.contains_exchange_marker(
        messageElement.textContent ?? ""
    )) {
        return null;
    }

    return get_deepest_matching_payload(
        messageElement,
        CHAT_SHARED_PROTOCOL.parse_strict_exchange_message
    );
}

async function chat_send_message(text, { storageKey = get_storage_key(), preserveDraft = true } = {}) {
    if (IS_CHAT_HOST) await refresh_cg_chat_cache();
    if (!cg_cached_enabled) throw new Error("CipherGap is paused.");
    if (storageKey !== get_storage_key()) throw new Error("The active chat changed before sending.");
    const input = document.querySelector(CHAT_CHAT_INPUT);
    if (!input) {
        throw new Error("The chat input is unavailable.");
    }

    if (cg_sending) throw new Error("A message is already being sent. Please try again.");
    const draft = chat_read_input(input);
    // Native contenteditables may render line breaks as spaces before clearing.
    const normalizedDraft = value => normalize_message_text(String(value ?? "").replace(/\s+/g, " "));
    const pendingText = normalizedDraft(text);
    const hasPendingText = () => normalizedDraft(chat_read_input(input)) === pendingText;
    let sent = false;
    // Block the sanitizer while we fill the input and click send.
    cg_sending = true;
    try {
        chat_write_input(input, text);
        await wait_for_main_thread();
        let currentSendButton;
        // Mobile clients render Send asynchronously (often replacing Record).
        // Recheck the chat on every wait, and click exactly once.
        for (let attempt = 0; attempt < 100; attempt++) {
            if (!cg_cached_enabled || storageKey !== get_storage_key() || !input.isConnected) throw new Error("The active chat changed or CipherGap was paused before sending.");
            currentSendButton = chat_send_control();
            if (currentSendButton && !currentSendButton.disabled) break;
            currentSendButton = null;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        if (!currentSendButton) throw new Error("The send button is no longer available.");
        currentSendButton.click();
        // Native clients can clear the draft after their send promise settles.
        for (let attempt = 0; attempt < 150; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 20));
            if (storageKey !== get_storage_key() || !input.isConnected || !hasPendingText()) break;
        }
        if (storageKey === get_storage_key() && input.isConnected && hasPendingText()) {
            throw new Error("The messenger did not accept the message. Your draft has been retained.");
        }
        sent = true;
    } finally {
        // Do not erase a newly typed draft or touch another chat after navigation.
        if (storageKey === get_storage_key() && input.isConnected && (!chat_read_input(input) || hasPendingText())) {
            chat_write_input(input, preserveDraft || !sent ? draft : "");
        }
        cg_sending = false;
        if (CHAT_DOM.defer_render_while_sending) document.querySelectorAll(CHAT_MESSAGE_ITEM).forEach(row => schedule_chat_message_processing(row, storageKey));
    }
}

// Clear the chat input field (used after exchange success / SAS verification).
function clear_chat_input() {
    const input = document.querySelector(CHAT_CHAT_INPUT);
    if (!input) {
        return false;
    }

    chat_write_input(input, "");
    return true;
}

// Guard: strip any exchange/SAS text that may have lingered in the input.
// Called on input changes so a stray exchange payload never gets sent again.
function sanitize_chat_input() {
    if (!cg_cached_enabled || cg_sending) {
        return; // Skip — chat_send_message is actively using the input
    }

    const input = document.querySelector(CHAT_CHAT_INPUT);
    if (!input) {
        return;
    }

    const text = normalize_message_text(chat_read_input(input) ?? "");
    if (CHAT_SHARED_PROTOCOL.is_exchange_message(text)) {
        chat_write_input(input, "");
        console.warn("[CipherGap] Stripped lingering exchange text from chat input.");
    }
}

function extract_chat_message_text(messageElement) {
    const packet = find_cgp_span(messageElement);
    if (packet) return normalize_message_text(packet.textContent);
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
// Forward secrecy maintenance
// =========================

// A ratcheted chat key only ever moves forward: once an epoch falls outside the
// retention window its chain key is replaced, so older messages cannot be read.
async function maintain_forward_secrecy(storageKey, secretKey, retentionDays) {
    const keyring = globalThis.CipherGapShared.keyring;
    if (!keyring.is_ratchet_secret(secretKey)) return;
    const profile = globalThis.CipherGapShared.formats.crypto.profiles.hkdf_aes_gcm_v2;
    const advanced = await keyring.ratchet_forward(secretKey, Number(retentionDays) || profile.default_retention_epochs);
    if (!advanced) return;
    const current = await globalThis.CipherGapShared.vault.get(storageKey);
    if (current[storageKey] !== secretKey) return; // changed elsewhere; do not overwrite
    await globalThis.CipherGapShared.vault.set({ [storageKey]: advanced });
    keyring.forget_cached();
}
setInterval(() => { if (IS_CHAT_HOST && !document.hidden) refresh_cg_chat_cache(true).catch(() => {}); }, 60 * 60 * 1000)?.unref?.();

// =========================
// Self-destructing messages
// =========================

const MESSAGE_TIMER_OPTIONS = [
    { id: "off", label: "Off" },
    { id: "5m", label: "5 minutes", expiresMs: 5 * 60 * 1000 },
    { id: "1h", label: "1 hour", expiresMs: 60 * 60 * 1000 },
    { id: "24h", label: "24 hours", expiresMs: 24 * 60 * 60 * 1000 },
    { id: "7d", label: "7 days", expiresMs: 7 * 24 * 60 * 60 * 1000 },
    { id: "burn", label: "Burn after reading (30 s)", viewSeconds: 30 }
];

async function cycle_message_timer() {
    const index = MESSAGE_TIMER_OPTIONS.findIndex(item => item.id === cg_cached_timer);
    const next = MESSAGE_TIMER_OPTIONS[(index + 1) % MESSAGE_TIMER_OPTIONS.length];
    cg_cached_timer = next.id;
    update_chat_security_toolbar(null, cg_cached_exchange_status);
    await chrome.storage.local.set({ [globalThis.CipherGapShared.storage_keys.message_timer(get_storage_key())]: next.id });
    show_ciphergap_notice(next.id === "off" ? "Self-destruct is off." : `New messages self-destruct: ${next.label}.`, "info", 3500);
}

function message_timer_options() {
    const option = MESSAGE_TIMER_OPTIONS.find(item => item.id === cg_cached_timer);
    if (!option || option.id === "off") return {};
    const maxTtl = CHAT_SHARED_CRYPTO.max_ttl_ms;
    // Burn-after-reading messages still get a hard upper bound.
    return { expiresAt: Date.now() + (option.expiresMs ?? maxTtl), viewSeconds: option.viewSeconds ?? 0 };
}

async function get_burn_records() {
    const key = globalThis.CipherGapShared.storage_keys.burned_messages;
    const stored = (await chrome.storage.local.get(key))[key];
    const records = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    const cutoff = Date.now() - 40 * 24 * 60 * 60 * 1000;
    return Object.fromEntries(Object.entries(records).filter(([, viewedAt]) => Number.isFinite(viewedAt) && viewedAt > cutoff));
}

// Returns when the message must disappear (ms since epoch), or Infinity.
async function message_end_of_life(opened, { start }) {
    let end = opened.expiresAt || Infinity;
    if (opened.viewSeconds) {
        const records = await get_burn_records();
        let viewedAt = records[opened.id];
        if (!viewedAt) {
            if (!start) return null; // not opened yet
            viewedAt = Date.now();
            records[opened.id] = viewedAt;
            await chrome.storage.local.set({ [globalThis.CipherGapShared.storage_keys.burned_messages]: records });
        }
        end = Math.min(end, viewedAt + opened.viewSeconds * 1000);
    }
    return end;
}

function render_expired_message(messageElement) {
    const view = message_visual_container(messageElement);
    if (!view) return;
    view.className = "ciphergap-message";
    view.dataset.mode = "expired";
    view.replaceChildren();
    const lock = document.createElement("span");lock.className = "ciphergap-message-lock";lock.append(CHAT_UI.icon("timer"));
    const copy = document.createElement("span");copy.className = "ciphergap-message-copy";
    const title = document.createElement("strong");title.textContent = "This message has self-destructed";
    const hint = document.createElement("small");hint.textContent = "It can no longer be read on this device";
    copy.append(title, hint);
    view.append(lock, copy);
    messageElement.dataset.ciphergapDecrypted = "true";
}

function watch_message_lifetime(messageElement, end) {
    if (!Number.isFinite(end)) return;
    const view = messageElement.querySelector('[data-ciphergap-ui="message"]');
    if (!view) return;
    const badge = document.createElement("small");
    badge.className = "ciphergap-expiry";
    badge.dataset.ciphergapUi = "expiry";
    view.append(badge);
    const tick = () => {
        const remaining = end - Date.now();
        if (!messageElement.isConnected || view.dataset.mode !== "decrypted") return clearInterval(timer);
        if (remaining <= 0) { clearInterval(timer); render_expired_message(messageElement); return; }
        const seconds = Math.ceil(remaining / 1000);
        badge.textContent = seconds < 120 ? `Disappears in ${seconds} s`
            : seconds < 7200 ? `Disappears in ${Math.ceil(seconds / 60)} min`
            : seconds < 172800 ? `Disappears in ${Math.ceil(seconds / 3600)} h` : `Disappears in ${Math.ceil(seconds / 86400)} days`;
    };
    const timer = setInterval(tick, 1000);
    tick();
}

// =========================
// Search decrypted messages (messages loaded in this chat)
// =========================

let chat_search = null;

function close_chat_search() {
    chat_search?.bar.remove();
    document.querySelectorAll("[data-ciphergap-search-hit]").forEach((row) => {
        delete row.dataset.ciphergapSearchHit;
        delete row.dataset.ciphergapSearchCurrent;
    });
    chat_search = null;
}

async function decrypt_loaded_messages() {
    const scroller = document.querySelector(CHAT_MESSAGE_SCROLLER);
    if (!scroller) return;
    await refresh_cg_chat_cache();
    for (const row of scroller.querySelectorAll(CHAT_MESSAGE_ITEM)) {
        if (row.dataset.ciphergapDecrypted === "true") continue;
        if (!CHAT_SHARED_PROTOCOL.is_ciphergap_packet(extract_cgp_packet_text(row))) continue;
        try { await decrypt_message_element(row, cg_cached_key, cg_cached_message_key); }
        catch { /* burn messages and unreadable ones are skipped */ }
    }
}

function run_chat_search(direction = 0) {
    if (!chat_search) return;
    const term = chat_search.input.value.trim().toLocaleLowerCase();
    const rows = [...document.querySelectorAll(CHAT_MESSAGE_ITEM)];
    rows.forEach((row) => { delete row.dataset.ciphergapSearchHit; delete row.dataset.ciphergapSearchCurrent; });
    chat_search.hits = term ? rows.filter((row) => [...row.querySelectorAll(".ciphergap-plaintext")]
        .some((node) => node.textContent.toLocaleLowerCase().includes(term))) : [];
    chat_search.hits.forEach((row) => { row.dataset.ciphergapSearchHit = "true"; });
    if (chat_search.hits.length) {
        chat_search.index = (chat_search.index + direction + chat_search.hits.length) % chat_search.hits.length;
        const current = chat_search.hits[chat_search.index];
        current.dataset.ciphergapSearchCurrent = "true";
        current.scrollIntoView({ block: "center", behavior: "smooth" });
    } else chat_search.index = 0;
    chat_search.count.textContent = term ? (chat_search.hits.length ? `${chat_search.index + 1} / ${chat_search.hits.length}` : "No matches") : "";
}

async function toggle_chat_search() {
    if (chat_search) { close_chat_search(); return; }
    if (!cg_cached_key || !cg_cached_enabled) return;
    const bar = document.createElement("div");
    bar.dataset.ciphergapUi = "search";
    bar.className = "ciphergap-search-bar";
    bar.setAttribute("role", "search");
    const input = document.createElement("input");
    input.type = "search"; input.placeholder = "Search decrypted messages"; input.setAttribute("aria-label", "Search decrypted messages");
    input.dir = "auto";
    const count = document.createElement("span"); count.className = "ciphergap-search-bar__count"; count.setAttribute("aria-live", "polite");
    const make = (label, glyph) => { const button = document.createElement("button"); button.type = "button"; CHAT_UI.button(button, glyph, label, true); return button; };
    const prev = make("Previous match", "up"), next = make("Next match", "down"), close = make("Close search", "close");
    const hint = document.createElement("small"); hint.textContent = "Searches messages loaded in this chat. Scroll up to load older ones.";
    bar.append(input, count, prev, next, close, hint);
    document.body.append(bar);
    chat_search = { bar, input, count, hits: [], index: 0 };
    let timer = null;
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(async () => { await decrypt_loaded_messages(); chat_search && (chat_search.index = 0, run_chat_search(0)); }, 200); });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); run_chat_search(event.shiftKey ? -1 : 1); }
        if (event.key === "Escape") close_chat_search();
    });
    prev.addEventListener("click", () => run_chat_search(-1));
    next.addEventListener("click", () => run_chat_search(1));
    close.addEventListener("click", close_chat_search);
    input.focus();
    decrypt_loaded_messages().catch(() => {});
}

// Optional review step: shows the plaintext next to what the messenger will receive.
function confirm_send_preview(plainText, packet) {
    return new Promise((resolve) => {
        const dialog = document.createElement("dialog");
        dialog.dataset.ciphergapUi = "send-preview";
        dialog.className = "ciphergap-send-preview";
        const form = document.createElement("form");
        form.method = "dialog";
        const heading = document.createElement("h2");
        heading.textContent = "Review before sending";
        const youLabel = document.createElement("strong"); youLabel.textContent = "Your message";
        const you = document.createElement("p"); you.className = "ciphergap-send-preview__plain"; you.dir = "auto"; you.textContent = plainText; you.setAttribute("translate", "no");
        const wireLabel = document.createElement("strong"); wireLabel.textContent = "What the messenger receives";
        const wire = document.createElement("code"); wire.dir = "ltr"; wire.setAttribute("translate", "no");
        const visible = CHAT_SHARED_PROTOCOL.strip_ciphergap_notice(packet);
        wire.textContent = visible.length > 170 ? visible.slice(0, 170) + "…" : visible;
        const size = document.createElement("small"); size.textContent = `${visible.length} characters of ciphertext. Only people with your chat key can read it.`;
        const actions = document.createElement("div"); actions.className = "ciphergap-send-preview__actions";
        const cancel = document.createElement("button"); cancel.type = "submit"; cancel.value = "cancel"; cancel.className = "ciphergap-action"; cancel.textContent = "Cancel";
        const send = document.createElement("button"); send.type = "submit"; send.value = "send"; send.className = "ciphergap-action ciphergap-action--primary"; send.textContent = "Send";
        actions.append(cancel, send);
        form.append(heading, youLabel, you, wireLabel, wire, size, actions);
        dialog.append(form);
        dialog.addEventListener("close", () => { const sent = dialog.returnValue === "send"; dialog.remove(); resolve(sent); });
        document.body.append(dialog);
        dialog.showModal();
        send.focus();
    });
}

// =========================
// Encrypt button
// =========================

function inject_encrypt_button_chat() {
    if (document.getElementById("ciphergap-btn")) {
        return;
    }

    const chatFooter = chat_composer();
    if (!chatFooter) {
        return;
    }

    const sendControl = chat_send_control();
    if (!sendControl && !CHAT_FLOATING_TOOLBAR) {
        return;
    }

    const sendSlot = sendControl?.closest("button") ?? sendControl;
    const buttonContainer = CHAT_FLOATING_TOOLBAR ? document.getElementById("ciphergap-toolbar") : sendSlot.parentElement;
    if (!buttonContainer) {
        return;
    }

    // the messenger's inline display:none still hides both controls for an empty draft.
    if (!CHAT_FLOATING_TOOLBAR) buttonContainer.classList.add("ciphergap-send-controls");

    const button = document.createElement("button");
    button.id = "ciphergap-btn";
    button.className = "ciphergap-action";
    button.type = "button";
    CHAT_UI.button(button, "send", "Encrypt");
    button.setAttribute("aria-label", "Encrypt and send with CipherGap");
    button.title = "Encrypt and send with CipherGap";

    button.addEventListener("click", async () => {
        try {
            button.disabled = true;
            button.setAttribute("aria-busy", "true");
            button.setAttribute("aria-label", "Encrypting and sending with CipherGap");
            CHAT_UI.set_label(button, "Sending…");

            const input = document.querySelector(CHAT_CHAT_INPUT);
            if (!input) {
                return;
            }

            const plainText = chat_read_input(input)?.trim();
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

            const finalMessage = await CHAT_SHARED_CRYPTO.seal_message(
                plainText,
                secretKey,
                cg_cached_message_key,
                message_timer_options()
            );
            if (cg_cached_preview && !await confirm_send_preview(plainText, finalMessage)) return;
            if (!cg_cached_enabled || storageKey !== get_storage_key() || cg_cached_key !== secretKey) {
                throw new Error("The chat or key changed while encrypting the message.");
            }
            await chat_send_message(finalMessage, { storageKey, preserveDraft: false });
            globalThis.CipherGapShared.vault.touch().catch(() => {});
            show_ciphergap_notice("Encrypted message sent.", "success", 3000);
        } catch (error) {
            console.error("[CipherGap] Encrypt failed:", error);
            show_ciphergap_notice(
                error.message || "Message not sent because encryption failed. Please try again.",
                "error",
                7000
            );
        } finally {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            button.setAttribute("aria-label", "Encrypt and send with CipherGap");
            CHAT_UI.set_label(button, "Encrypt");
        }
    });
    if (CHAT_FLOATING_TOOLBAR) buttonContainer.append(button);
    else buttonContainer.insertBefore(button, sendSlot);
}

function find_cgp_span(messageElement) {
    return get_deepest_matching_payload(messageElement, (text) => {
        const normalized = normalize_message_text(text);
        return CHAT_SHARED_PROTOCOL.is_ciphergap_packet(normalized)
            ? { normalized }
            : null;
    })?.element ?? null;
}

function hide_ciphergap_message_notice(messageElement) {
    if (find_cgp_span(messageElement) || messageElement.dataset.ciphergapDecrypted === "true") {
        for (const preview of CHAT_DOM.notice_previews?.(messageElement) ?? []) {
            preview.dataset.ciphergapLinkPreview = "true";
            if (!preview.hidden) preview.hidden = true;
        }
    }
    const existing = messageElement.querySelector('[data-ciphergap-message-notice]');
    if (existing) {
        if (!existing.hidden) existing.hidden = true;
        return;
    }
    const payload = get_deepest_matching_payload(messageElement, text => {
        if (!CHAT_SHARED_PROTOCOL.is_ciphergap_packet(text)) return null;
        const notice = CHAT_SHARED_PROTOCOL.find_ciphergap_notice(text);
        return notice ? { notice } : null;
    });
    if (!payload) return;

    // A Range preserves the messenger's link and paragraph elements even when the
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

    return CHAT_SHARED_PROTOCOL.is_ciphergap_packet(text)
        ? CHAT_SHARED_PROTOCOL.strip_ciphergap_notice(text) : "";
}

function replace_message_visual(messageElement, encryptedText, decryptedText) {
    const view = message_visual_container(messageElement);
    if (!view) return;
    view.className = "ciphergap-message";view.dataset.mode = "decrypted";
    view.replaceChildren();

    const plaintext = document.createElement("span");
    plaintext.className = "ciphergap-plaintext";
    plaintext.dir = "auto";
    plaintext.textContent = decryptedText;
    plaintext.setAttribute("translate", "no");
    plaintext.dataset.emojiOnly = String(/^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\uFE0F|\u200D|\s)+$/u.test(decryptedText));

    const encryptedDetails = document.createElement("details");
    encryptedDetails.className = "ciphergap-encrypted-details";

    const summary = document.createElement("summary");
    summary.append(CHAT_UI.icon("lock"), document.createTextNode("Encrypted message"));

    const ciphertext = document.createElement("code");
    ciphertext.dir = "ltr";
    ciphertext.textContent = encryptedText;

    encryptedDetails.appendChild(summary);
    encryptedDetails.appendChild(ciphertext);
    view.append(plaintext, encryptedDetails);
}

function message_visual_container(row) {
    const raw = find_cgp_span(row);
    if (!raw) return null;
    CHAT_UI.layout(row, raw);
    raw.dataset.ciphergapMessageRaw = "true";raw.hidden = true;
    let view = row.querySelector('[data-ciphergap-ui="message"]');
    if (!view) {view = document.createElement("div");view.dataset.ciphergapUi = "message";raw.insertAdjacentElement("afterend", view);}
    return view;
}

function reset_chat_message_views() {
    globalThis.CipherGapShared.file_viewer?.close();
    globalThis.CipherGapShared.stickers?.close();
    document.querySelectorAll('[data-ciphergap-ui="message"], [data-ciphergap-ui="file-action"], [data-ciphergap-ui="quote"]').forEach(node => node.remove());
    document.querySelectorAll('[data-ciphergap-message-raw], [data-ciphergap-native-file], [data-ciphergap-quote-raw]').forEach(node => {node.hidden = false;});
    document.querySelectorAll('[data-ciphergap-layout]').forEach(node => {delete node.dataset.ciphergapLayout;});
    document.querySelectorAll(CHAT_MESSAGE_ITEM).forEach(row => {delete row.dataset.ciphergapDecrypted;delete row.dataset.ciphergapProcessed;});
}

function render_chat_quote_previews(row) {
    CHAT_DOM.prepare_message?.(row);
    const body = CHAT_DOM.payload_root?.(row);
    if (!body || body === row) return;
    for (const raw of row.querySelectorAll('div[dir="auto"]')) {
        if (body.contains(raw) || raw.contains(body) || is_ciphergap_ui_element(raw)) continue;
        const encrypted = CHAT_SHARED_PROTOCOL.is_ciphergap_packet(raw.textContent.trim());
        if (!encrypted) {
            if (raw.dataset.ciphergapQuoteRaw) {raw.hidden = false;delete raw.dataset.ciphergapQuoteRaw;if(raw.nextElementSibling?.dataset.ciphergapUi === "quote") raw.nextElementSibling.remove();}
            continue;
        }
        raw.dataset.ciphergapQuoteRaw = "true";raw.hidden = true;
        if (raw.nextElementSibling?.dataset.ciphergapUi === "quote") continue;
        const label = document.createElement("span");label.dataset.ciphergapUi = "quote";label.className = "ciphergap-quote-label";
        label.append(CHAT_UI.icon("lock"),document.createTextNode("Encrypted message"));raw.insertAdjacentElement("afterend",label);
    }
}

function create_decrypt_button() {
    const button = document.createElement("button");
    button.className = "ciphergap-action ciphergap-decrypt-button";
    button.type = "button";
    CHAT_UI.button(button, "lock", "Decrypt");
    button.setAttribute("aria-label", "Decrypt this CipherGap message");
    return button;
}

function attach_decrypt_button(messageElement, decryptButton) {
    const wrapper = message_visual_container(messageElement);
    if (!wrapper) return;
    wrapper.className = "ciphergap-message ciphergap-decrypt-wrap";
    const lock = document.createElement("span");lock.className = "ciphergap-message-lock";lock.append(CHAT_UI.icon("lock"));
    const copy = document.createElement("span");copy.className = "ciphergap-message-copy";
    const title = document.createElement("strong");title.textContent = "Encrypted message";
    const hint = document.createElement("small");hint.textContent = "Decrypt locally with your chat key";copy.append(title,hint);
    wrapper.append(lock, copy, decryptButton);
}

function decrypt_failure_message(error) {
    if (error?.code === "KEY_EXPIRED") return "This message is older than the forward-secrecy retention window. Its key was deleted.";
    if (error?.code === "LEGACY_UNAVAILABLE") return "This is a version 1 message. Forward secrecy deleted the key it needs.";
    if (error?.code === "AUTH_FAILED") return "Could not decrypt this message. Wrong key, or the message was modified.";
    if (error?.code === "BAD_EPOCH") return error.message;
    return "Could not decrypt this message. Check the chat key and try again.";
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
            cg_cached_message_key,
            { manual: true }
        );
        decryptButton.remove();
    } catch (error) {
        console.error("[CipherGap] Decrypt failed:", error);
        CHAT_UI.set_label(decryptButton, "Try again");
        show_ciphergap_notice(
            decrypt_failure_message(error),
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
    cachedCryptoKey = null,
    options = {}
) {
    const storageKey = get_storage_key();
    const currentText = extract_cgp_packet_text(messageElement);
    if (!CHAT_SHARED_PROTOCOL.is_ciphergap_packet(currentText)) {
        throw new Error("Could not read encrypted message from this bubble.");
    }

    const secretKey = providedSecretKey ?? await get_secret_key();
    if (!secretKey) {
        throw new Error("No encryption key set for this chat.");
    }

    let opened;
    try {
        opened = await CHAT_SHARED_CRYPTO.open_message(currentText, secretKey, cachedCryptoKey);
    } catch (error) {
        // After a group key rotation, older messages open with the previous keys.
        if (error?.code !== "AUTH_FAILED") throw error;
        opened = await decrypt_with_previous_group_keys(currentText);
        if (!opened) throw error;
    }
    if (!cg_cached_enabled || get_storage_key() !== storageKey || cg_cached_key !== secretKey || !messageElement.isConnected) throw new Error("The chat or key changed during decryption.");

    const end = await message_end_of_life(opened, { start: options.manual === true });
    if (end === null) {
        const error = new Error("Open this self-destructing message to start its timer.");
        error.code = "NEEDS_CLICK";
        throw error;
    }
    if (end <= Date.now()) {
        render_expired_message(messageElement);
        return true;
    }
    replace_message_visual(messageElement, currentText, opened.text);
    watch_message_lifetime(messageElement, end);
    messageElement.dataset.ciphergapDecrypted = "true";
    return true;
}

const chat_decrypt_queue = [];
const chat_decrypt_queued = new WeakSet();
let chat_decrypt_worker_running = false;

function wait_for_main_thread() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function queue_chat_message_decryption(messageElement, storageKey = get_storage_key()) {
    if (
        chat_decrypt_queued.has(messageElement) ||
        messageElement.dataset.ciphergapDecrypted === "true"
    ) {
        return;
    }

    chat_decrypt_queued.add(messageElement);
    chat_decrypt_queue.push({ messageElement, storageKey });
    drain_chat_decrypt_queue().catch((error) => {
        console.error("[CipherGap] Decrypt queue failed:", error);
    });
}

async function drain_chat_decrypt_queue() {
    if (chat_decrypt_worker_running) {
        return;
    }

    chat_decrypt_worker_running = true;
    try {
        while (chat_decrypt_queue.length > 0) {
            const { messageElement, storageKey } = chat_decrypt_queue.shift();
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
                if (error?.code !== "NEEDS_CLICK") console.warn("[CipherGap] Auto-decrypt failed, falling back to button:", error);
                if (messageElement.isConnected && storageKey === get_storage_key()) {
                    attach_decrypt_button_to(messageElement);
                    if (error?.code === "NEEDS_CLICK") {
                        const hint = messageElement.querySelector(".ciphergap-message-copy small");
                        if (hint) hint.textContent = "Self-destructing · the timer starts when you open it";
                    }
                }
            } finally {
                chat_decrypt_queued.delete(messageElement);
            }

            // Keep large chat restores responsive instead of starting every
            // WebCrypto operation in the same task.
            await wait_for_main_thread();
        }
    } finally {
        chat_decrypt_worker_running = false;
        if (chat_decrypt_queue.length > 0) {
            drain_chat_decrypt_queue().catch(() => {});
        }
    }
}

function process_encrypted_chat_message(messageElement) {
    if (messageElement.dataset.ciphergapProcessed) {
        return;
    }

    const text = extract_cgp_packet_text(messageElement);
    if (
        !CHAT_SHARED_PROTOCOL.is_ciphergap_packet(text) ||
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
            !cg_cached_enabled || !messageElement.isConnected ||
            messageStorageKey !== get_storage_key()
        ) {
            delete messageElement.dataset.ciphergapProcessed;
            return;
        }

        if (cg_cached_auto_decrypt && cg_cached_key) {
            queue_chat_message_decryption(messageElement, messageStorageKey);
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
        !cg_cached_enabled ||
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
    const scroller = document.querySelector(CHAT_MESSAGE_SCROLLER);
    if (!scroller) {
        return;
    }

    await refresh_cg_chat_cache(true);
    if (!cg_cached_key) {
        return;
    }

    const messageElements = Array.from(scroller.querySelectorAll(CHAT_MESSAGE_ITEM));
    for (let index = 0; index < messageElements.length; index += 1) {
        const messageElement = messageElements[index];
        if (
            messageElement.dataset.ciphergapDecrypted === "true" ||
            !bind_chat_message_to_storage(
                messageElement,
                cg_cached_storage_key
            )
        ) {
            continue;
        }
        const text = extract_cgp_packet_text(messageElement);
        if (!CHAT_SHARED_PROTOCOL.is_ciphergap_packet(text)) {
            continue;
        }

        queue_chat_message_decryption(messageElement, cg_cached_storage_key);
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
    if (!CHAT_SHARED_FILE_CRYPTO.contains_cgpe_filename(
        messageElement.textContent ?? ""
    )) {
        return null;
    }

    return get_deepest_matching_payload(messageElement, (text) => {
        const normalized = normalize_message_text(text);
        return CHAT_SHARED_FILE_CRYPTO.contains_cgpe_filename(normalized)
            ? { normalized }
            : null;
    });
}

// Create a "Decrypt File" button for encrypted file attachments.
function create_file_decrypt_button() {
    const button = document.createElement("button");
    button.className = "ciphergap-action ciphergap-file-decrypt-button";
    button.type = "button";
    CHAT_UI.button(button, "lock", "Open");
    button.setAttribute("aria-label", "Decrypt and preview this CipherGap attachment");
    return button;
}

// Decrypt a CGPE file from a Blob/ArrayBuffer and trigger download.
async function decrypt_and_present_file(
    encryptedBuffer,
    secretKey,
    statusButton,
    fileCryptoKey = null,
    automatic = false,
    storageKey = get_storage_key()
) {
    const decrypted = await CHAT_SHARED_FILE_CRYPTO.decrypt_cgpe(
        encryptedBuffer,
        secretKey,
        fileCryptoKey
    );
    await refresh_cg_chat_cache();
    if (storageKey !== get_storage_key() || !cg_cached_enabled || cg_cached_key !== secretKey || statusButton?.isConnected === false) {
        throw new Error("The chat, key or enabled state changed during file decryption.");
    }
    const sticker = globalThis.CipherGapShared.stickers.unpack(decrypted);
    const row = statusButton?.closest(CHAT_MESSAGE_ITEM);
    if (sticker && row) {
        const wrapper = statusButton.closest('[data-ciphergap-ui="file-action"]');
        const scroll = CHAT_UI.scroll_container(wrapper);
        const pinned = scroll && scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 48;
        const preview = globalThis.CipherGapShared.file_viewer.inline(sticker, wrapper);
        requestAnimationFrame(() => {
            if (!preview.isConnected) return;
            if (pinned && scroll.isConnected) scroll.scrollTop = scroll.scrollHeight;
            else if (!automatic) preview.scrollIntoView({block:"nearest"});
        });
        if (automatic) globalThis.CipherGapShared.file_viewer.download(sticker);
    } else if (automatic) globalThis.CipherGapShared.file_viewer.download(decrypted);
    else globalThis.CipherGapShared.file_viewer.open(decrypted);
    if (statusButton) {
        CHAT_UI.set_label(statusButton, automatic ? "Downloaded" : "Open again");
        statusButton.setAttribute("aria-label", "CipherGap file decrypted");
        statusButton.dataset.state = "success";
    }
    if (automatic) show_ciphergap_notice(`${decrypted.name} was decrypted and downloaded.`, "success");
}

// Fallback decrypt path: open a hidden file picker so the user can select
// the .cgpe file they downloaded via the messenger's own دانلود button.
function choose_downloaded_cgpe_file(event, messageElement, decryptButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = CHAT_SHARED_FILE_CRYPTO.get_cgpe_file_accept();
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
            CHAT_UI.set_label(decryptButton, "Decrypting…");
            delete decryptButton.dataset.state;
            decryptButton.setAttribute("aria-busy", "true");
            decryptButton.setAttribute("aria-label", "Decrypting CipherGap file");

            await refresh_cg_chat_cache();
            const secretKey = cg_cached_key;
            if (!secretKey) {
                throw new Error("No encryption key set for this chat.\nSet a key or exchange keys first.");
            }

            const maxContainerBytes = CHAT_SHARED_FILE_CRYPTO
                .get_cgpe_max_container_bytes();
            if (file.size > maxContainerBytes) {
                throw new Error(
                    `This encrypted file exceeds CipherGap's ${CHAT_SHARED_FILE_CRYPTO.get_cgpe_max_file_size_label()} safety limit.`
                );
            }

            const encryptedBuffer = await file.arrayBuffer();
            if (storageKey !== get_storage_key()) throw new Error("The active chat changed before decryption.");
            await decrypt_and_present_file(
                encryptedBuffer,
                secretKey,
                decryptButton,
                cg_cached_message_key
            );
        } catch (error) {
            console.error("[CipherGap] File decrypt failed:", error);
            CHAT_UI.set_label(decryptButton, "Try again");
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

let chat_file_download_chain = Promise.resolve();
let chat_file_bridge_request = null;
let chat_chat_opened_at = Date.now();
const chat_auto_file_attempts = new Set();

function request_chat_encrypted_file(messageElement, filename, storageKey) {
    if (!CHAT_DOM.read_cached_file) return request_native_chat_file(messageElement, filename, storageKey);
    return CHAT_DOM.read_cached_file(messageElement, CHAT_SHARED_FILE_CRYPTO.get_cgpe_max_container_bytes()).then(cached => {
        if (storageKey !== get_storage_key() || !cg_cached_enabled || !messageElement.isConnected) throw new Error("The active chat changed during file download.");
        return cached ?? request_native_chat_file(messageElement, filename, storageKey);
    });
}
function request_native_chat_file(messageElement, filename, storageKey) {
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
            if (chat_file_bridge_request?.id === id) chat_file_bridge_request = null;
            window.postMessage({ source: "ciphergap-content", type: "cancel_file", id }, location.origin);
            error ? reject(error) : resolve(bytes);
        };
        const clickAttachment = () => {
            if (settled) return;
            if (storageKey !== get_storage_key() || !messageElement.isConnected) {
                finish(new Error("The active chat changed during file download."));
                return;
            }
            if (CHAT_DOM.read_cached_file) {
                CHAT_DOM.read_cached_file(messageElement, CHAT_SHARED_FILE_CRYPTO.get_cgpe_max_container_bytes())
                    .then(bytes => { if (bytes && !settled && storageKey === get_storage_key() && cg_cached_enabled) finish(null, bytes); })
                    .catch(error => finish(error));
            }
            const carrier = find_cgpe_file_in_message(messageElement)?.element;
            try {
                CHAT_DOM.click_attachment(messageElement, carrier, Boolean(retryTimer));
            } catch (error) { finish(error); }

        };
        const onMessage = (event) => {
            if (event.source !== window || event.origin !== location.origin || event.data?.source !== "ciphergap-main" || event.data.id !== id) return;
            if (event.data.type === "file_ready") {
                clickAttachment();
                if (!settled && !retryTimer) retryTimer = setInterval(clickAttachment, 1500);
            }
            if (event.data.type === "file_bytes") {
                const bytes = event.data.bytes;
                if (!globalThis.CipherGapShared.encoding.is_array_buffer(bytes) || bytes.byteLength > CHAT_SHARED_FILE_CRYPTO.get_cgpe_max_container_bytes()) {
                    finish(new Error("The downloaded file exceeds the safety limit or is invalid."));
                } else finish(null, bytes);
            }
        };
        const timeout = setTimeout(() => finish(new Error("The messenger did not provide this file in time. Try again or choose the downloaded .cgpe file.")), 45000);
        chat_file_bridge_request = { id, storageKey, cancel: () => finish(new Error("The active chat changed during file download.")) };
        window.addEventListener("message", onMessage);
        window.postMessage({ source: "ciphergap-content", type: "read_file", id, filename, documentId: CHAT_DOM.document_id?.(messageElement), maxBytes: CHAT_SHARED_FILE_CRYPTO.get_cgpe_max_container_bytes() }, location.origin);
    });
}

function download_chat_encrypted_file(messageElement, button, automatic = false) {
    const storageKey = get_storage_key();
    button.disabled = true;
    CHAT_UI.set_label(button, "Downloading…");
    button.setAttribute("aria-busy", "true");
    const job = chat_file_download_chain.catch(() => {}).then(async () => {
        if (storageKey !== get_storage_key() || !messageElement.isConnected) throw new Error("The active chat changed before downloading.");
        await refresh_cg_chat_cache();
        const secretKey = cg_cached_key;
        if (!secretKey || !cg_cached_enabled) throw new Error("Enable CipherGap and set up a chat key before decrypting attachments.");
        const payload = find_cgpe_file_in_message(messageElement);
        if (!payload) throw new Error("This attachment is no longer available.");
        const encrypted = await request_chat_encrypted_file(messageElement, payload.normalized, storageKey);
        if (storageKey !== get_storage_key() || secretKey !== cg_cached_key) throw new Error("The chat or key changed during download.");
        CHAT_UI.set_label(button, "Decrypting…");
        await decrypt_and_present_file(encrypted, secretKey, button, cg_cached_message_key, automatic, storageKey);
        if (automatic) {
            const key = globalThis.CipherGapShared.storage_keys.downloaded_files(storageKey);
            const result = await chrome.storage.local.get(key);
            await chrome.storage.local.set({ [key]: [...(result[key] || []), CHAT_DOM.message_id(messageElement)].slice(-100) });
        }
    }).catch((error) => {
        CHAT_UI.set_label(button, "Try again");
        button.dataset.state = "error";
        show_ciphergap_notice(error.message, "error", 7000);
    }).finally(() => {
        button.disabled = false;
        button.removeAttribute("aria-busy");
    });
    chat_file_download_chain = job;
    return job;
}

function handle_file_decrypt_click(event, messageElement, button) {
    event.preventDefault();
    event.stopImmediatePropagation();
    download_chat_encrypted_file(messageElement, button);
}

async function auto_receive_chat_file(messageElement, button) {
    const storageKey = get_storage_key();
    const sid = CHAT_DOM.message_id(messageElement);
    const sentAt = CHAT_DOM.sent_at(messageElement) || chat_seen_at(messageElement);
    if (!Number.isFinite(sentAt) || sentAt < chat_chat_opened_at || !CHAT_DOM.is_incoming(messageElement) || chat_auto_file_attempts.has(sid)) return;
    // Bind before the first await, so repeated DOM mutations cannot queue it twice.
    chat_auto_file_attempts.add(sid);
    if (chat_auto_file_attempts.size > 1000) chat_auto_file_attempts.delete(chat_auto_file_attempts.values().next().value);
    await refresh_cg_chat_cache();
    if (!cg_cached_auto_files || !cg_cached_key || get_storage_key() !== storageKey) return;
    const key = globalThis.CipherGapShared.storage_keys.downloaded_files(storageKey);
    const result = await chrome.storage.local.get(key);
    if ((result[key] || []).includes(sid) || get_storage_key() !== storageKey) return;
    return download_chat_encrypted_file(messageElement, button, true);
}

// Attach a Decrypt File button next to the filename inside the messenger's bubble.
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
    const stickerHint = /\.cgst\.cgpe$/i.test(filePayload.normalized);
    hint.append(CHAT_UI.icon(stickerHint ? "smile" : "lock"),document.createTextNode(stickerHint ? "Encrypted sticker" : "Encrypted file"));
    hint.dir = "auto";

    const wrapper = document.createElement("span");
    wrapper.className = "ciphergap-file-decrypt-wrap";
    wrapper.dataset.ciphergapUi = "file-action";
    wrapper.appendChild(hint);
    wrapper.appendChild(decryptButton);
    const localButton = document.createElement("button");
    localButton.type = "button";
    localButton.textContent = "Choose downloaded file instead";
    localButton.addEventListener("click", (event) => choose_downloaded_cgpe_file(event, messageElement, decryptButton));
    const fallback = document.createElement("details"), summary = document.createElement("summary");
    summary.textContent = "Having trouble opening it?";fallback.append(summary, localButton);wrapper.append(fallback);

    // The filename carrier gives us a semantic in-bubble anchor and avoids
    // the messenger's generated class names and fragile parent-count traversal.
    const interactiveAttachment = CHAT_DOM.file_action_anchor?.(filePayload.element) ?? filePayload.element.closest("a, button");
    const mountAnchor = interactiveAttachment && messageElement.contains(interactiveAttachment)
        ? interactiveAttachment
        : filePayload.element;
    let scrollParent = messageElement.parentElement;
    while (scrollParent && !/^(auto|scroll)$/.test(getComputedStyle(scrollParent).overflowY)) scrollParent = scrollParent.parentElement;
    const pinnedToEnd = scrollParent && scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight < 48;
    mountAnchor.insertAdjacentElement("afterend", wrapper);
    CHAT_UI.layout(messageElement, mountAnchor);
    if (stickerHint) {mountAnchor.dataset.ciphergapNativeFile = "true";mountAnchor.hidden = true;}
    // Keep the newly expanded file card visible only when the user was already
    // at the end; reading older messages must never move the conversation.
    if (pinnedToEnd) requestAnimationFrame(() => { if (scrollParent.isConnected) scrollParent.scrollTop = scrollParent.scrollHeight; });
    auto_receive_chat_file(messageElement, decryptButton).catch(() => {});
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

function update_chat_exchange_cards() {
    globalThis.CipherGapShared.exchange_ui.update(document.querySelectorAll('[data-ciphergap-ui="protocol"]'), {
        storageKey: get_storage_key(), enabled: cg_cached_enabled, status: cg_cached_exchange_status
    });
}

function create_exchange_chat_card(parsed, signature) {
    return globalThis.CipherGapShared.exchange_ui.create_request(parsed, signature, {
        readState: () => ({ storageKey: get_storage_key(), enabled: cg_cached_enabled, hasKey: Boolean(cg_cached_key) }),
        onRespond: async (accept, nonce) => { await respond_to_incoming_exchange(accept, nonce); await refresh_cg_chat_cache(true); },
        onError: error => show_ciphergap_notice(error.message, 'error', 7000),
        onUpdate: update_chat_exchange_cards
    });
}

if (IS_CHAT_HOST) setInterval(() => {
    update_chat_exchange_cards();
    if (cg_cached_enabled && cg_cached_exchange_status &&
        CHAT_SHARED_PROTOCOL.get_exchange_expires_at(cg_cached_exchange_status) <= Date.now()) {
        cleanup_stale_exchange_status(get_storage_key()).catch(() => {});
    }
}, 1000);

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
    CHAT_UI.layout(messageElement, rawPayload);

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
            ? globalThis.CipherGapShared.exchange_ui.create_code(parsed, signature)
            : create_exchange_chat_card(parsed, signature);
        const timer = document.createElement('span');
        timer.className = 'ciphergap-chat-card__timer';
        timer.dir = 'ltr';
        timer.setAttribute('aria-label', 'Time remaining for this exchange');
        card.append(timer);
    }
    card.dataset.ciphergapStorageKey = get_storage_key();
    card.dataset.ciphergapNonce = parsed.nonce ?? '';
    card.dataset.ciphergapExpiresAt = String(CHAT_SHARED_PROTOCOL.get_exchange_expires_at(parsed, CHAT_DOM.sent_at(messageElement)));

    // The raw payload's parent is the messenger's real text container. Mounting here
    // keeps the card inside the native bubble without generated class names.
    if (card.parentElement !== rawPayload.parentElement || card.previousElementSibling !== rawPayload) {
        rawPayload.insertAdjacentElement("afterend", card);
    }
    update_chat_exchange_cards();
    return true;
}

function clear_stale_protocol_ui(messageElement) {
    messageElement.querySelectorAll('[data-ciphergap-ui="protocol"], [data-ciphergap-ui="group-card"]')
        .forEach((card) => card.remove());
    delete messageElement.dataset.ciphergapGroupHandled;
    messageElement.querySelectorAll('[data-ciphergap-protocol-raw="true"]')
        .forEach((rawPayload) => {
            rawPayload.hidden = false;
            rawPayload.removeAttribute("aria-hidden");
            delete rawPayload.dataset.ciphergapProtocolRaw;
        });
    delete messageElement.dataset.ciphergapExchangeHandled;
    clear_legacy_protocol_row_styles(messageElement);
}

function process_chat_message(
    messageElement,
    expectedStorageKey = get_storage_key()
) {
    // Some native clients finish their send commit after mounting the bubble.
    // Leave those children alone until their editor/draft has settled.
    if (cg_sending && CHAT_DOM.defer_render_while_sending) return;
    if (
        !cg_cached_enabled || !cg_cache_ready || !messageElement?.matches?.(CHAT_MESSAGE_ITEM) ||
        !get_current_chat_id() ||
        expectedStorageKey !== get_storage_key() ||
        !bind_chat_message_to_storage(messageElement, expectedStorageKey)
    ) {
        return;
    }

    if (!chat_seen_rows.has(messageElement)) {
        const id = Number(CHAT_DOM.message_id(messageElement));
        const historical = CHAT_DOM.history_by_id && (Date.now() - chat_chat_opened_at < 1000 || !Number.isFinite(id) || id <= chat_auto_file_floor);
        chat_seen_rows.set(messageElement, historical ? 1 : Date.now());
        if (CHAT_DOM.history_by_id && Number.isFinite(id)) chat_auto_file_floor = Math.max(chat_auto_file_floor, id);
        const receivedAt = CHAT_DOM.sent_at(messageElement) || chat_seen_at(messageElement);
        if (receivedAt >= chat_chat_opened_at && CHAT_DOM.is_incoming(messageElement)) {
            globalThis.CipherGapHost?.messageObserved?.({
                id: CHAT_DOM.message_id(messageElement),
                storageKey: expectedStorageKey,
                url: location.href,
                exchange: find_exchange_protocol_payload(messageElement)?.parsed.type === "start"
            });
        }
    }
    reserve_chat_scroll_space(messageElement);
    // Most channel rows are ordinary messages. Do not clone their subtrees or
    // mark native timestamps: virtualized history must remain native-owned.
    const content = normalize_message_text(messageElement.textContent ?? "");
    if (
        !Object.values(globalThis.CipherGapShared.formats.message.codecs).some(
            format => content.includes(`${format.prefix}${format.separator}`)
        ) &&
        !CHAT_SHARED_PROTOCOL.contains_exchange_marker(content) &&
        !globalThis.CipherGapShared.group.contains_marker(content) &&
        !CHAT_SHARED_FILE_CRYPTO.contains_cgpe_filename(content) &&
        !messageElement.querySelector('[data-ciphergap-ui], [data-ciphergap-quote-raw], [data-ciphergap-protocol-raw]')
    ) return;

    render_chat_quote_previews(messageElement);
    // Check for encrypted file attachments (.cgpe)
    process_cgpe_file_message(messageElement);

    const groupPayload = find_group_payload(messageElement);
    if (groupPayload) {
        handle_group_row(messageElement, groupPayload);
        return;
    }

    const protocolPayload = find_exchange_protocol_payload(messageElement);
    if (protocolPayload) {
        hide_exchange_protocol_message(messageElement, protocolPayload);

        if (
            messageElement.dataset.ciphergapExchangeHandled !==
            protocolPayload.signature
        ) {
            messageElement.dataset.ciphergapExchangeHandled =
                protocolPayload.signature;
            const sentAt = CHAT_DOM.sent_at(messageElement);
            const stale = (!sentAt && !protocolPayload.parsed.expiresAt) || CHAT_SHARED_PROTOCOL.get_exchange_expires_at(protocolPayload.parsed, sentAt) <= Date.now();
            (stale ? Promise.resolve() : handle_incoming_exchange_message(protocolPayload.protocolText, sentAt))
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

    const text = extract_chat_message_text(messageElement);
    if (!text) {
        return;
    }

    if (CHAT_SHARED_PROTOCOL.is_ciphergap_packet(text)) {
        process_encrypted_chat_message(messageElement);
    }
}

let chat_lifecycle_started = false;
let chat_lifecycle_observer = null;
let chat_lifecycle_timer = null;
let chat_message_observer = null;
let chat_observed_scroller = null;
let chat_observed_chat_input = null;
let chat_active_storage_key = null;
let chat_auto_file_floor = 0;
const chat_seen_rows = new WeakMap();
function chat_seen_at(row) { return chat_seen_rows.get(row) ?? NaN; }
let chat_scan_generation = 0;
const chat_message_storage_bindings = new WeakMap();
const chat_message_processing_queue = new Map();
let chat_message_processing_frame = null;
let chat_message_processing_timer = null;

function bind_chat_message_to_storage(messageElement, storageKey) {
    const sid = CHAT_DOM.message_id(messageElement);
    if (!sid || !storageKey) {
        return false;
    }

    const knownStorageKey = chat_message_storage_bindings.get(messageElement);
    if (knownStorageKey?.id === sid) return knownStorageKey.storageKey === storageKey;

    chat_message_storage_bindings.set(messageElement, { id: sid, storageKey });
    return true;
}

function flush_chat_message_processing_queue() {
    if (chat_message_processing_frame !== null) {
        cancelAnimationFrame(chat_message_processing_frame);
        chat_message_processing_frame = null;
    }
    if (chat_message_processing_timer !== null) {
        clearTimeout(chat_message_processing_timer);
        chat_message_processing_timer = null;
    }

    const queuedMessages = [...chat_message_processing_queue.entries()];
    chat_message_processing_queue.clear();
    queuedMessages.forEach(([messageElement, storageKey]) => {
        if (
            storageKey === get_storage_key() &&
            messageElement.isConnected &&
            messageElement.closest(CHAT_MESSAGE_SCROLLER) === chat_observed_scroller &&
            bind_chat_message_to_storage(messageElement, storageKey)
        ) {
            process_chat_message(messageElement, storageKey);
        }
    });
}

function schedule_chat_message_processing(
    messageElement,
    storageKey = get_storage_key()
) {
    if (
        !cg_cached_enabled || !cg_cache_ready || !messageElement?.matches?.(CHAT_MESSAGE_ITEM) ||
        !get_current_chat_id() ||
        storageKey !== get_storage_key() ||
        !bind_chat_message_to_storage(messageElement, storageKey)
    ) {
        return;
    }

    chat_message_processing_queue.set(messageElement, storageKey);
    if (chat_message_processing_frame === null) {
        // Run just before paint so a raw protocol payload does not flash while
        // still allowing the messenger's incremental React render to finish first.
        chat_message_processing_frame = requestAnimationFrame(
            flush_chat_message_processing_queue
        );
        // requestAnimationFrame pauses in a background tab; keep a timer as a
        // fallback so messages are ready when that tab becomes visible again.
        chat_message_processing_timer = setTimeout(
            flush_chat_message_processing_queue,
            100
        );
    }
}

function schedule_messages_from_node(node, storageKey = get_storage_key()) {
    const element = node instanceof Element ? node : node.parentElement;
    if (!element || is_ciphergap_ui_element(element)) {
        return;
    }

    schedule_chat_message_processing(
        element.closest(CHAT_MESSAGE_ITEM),
        storageKey
    );
    if (element.matches(CHAT_MESSAGE_ITEM)) {
        schedule_chat_message_processing(element, storageKey);
    }
    element.querySelectorAll?.(CHAT_MESSAGE_ITEM)
        .forEach((messageElement) =>
            schedule_chat_message_processing(messageElement, storageKey)
        );
}

async function scan_chat_messages(
    scroller,
    scanGeneration,
    storageKey = get_storage_key()
) {
    // Bale normally opens at the newest messages. Bind/process those first so
    // a rapid chat switch cannot leave the visible rows unassociated.
    const messageElements = Array.from(
        scroller.querySelectorAll(CHAT_MESSAGE_ITEM)
    ).reverse();

    if (
        !get_current_chat_id() ||
        storageKey !== get_storage_key() ||
        scanGeneration !== chat_scan_generation ||
        scroller !== chat_observed_scroller ||
        !scroller.isConnected
    ) {
        return;
    }

    // Bind every discovered row before the first yield. Even if the user
    // switches chats between batches, an unprocessed old row cannot later be
    // mistaken for a message from the new storage key.
    [...messageElements].reverse().forEach((messageElement) => {
        bind_chat_message_to_storage(messageElement, storageKey);
    });

    for (let index = 0; index < messageElements.length; index += 25) {
        if (
            scanGeneration !== chat_scan_generation ||
            scroller !== chat_observed_scroller ||
            !scroller.isConnected ||
            storageKey !== get_storage_key()
        ) {
            return;
        }

        messageElements
            .slice(index, index + 25)
            .forEach((messageElement) =>
                process_chat_message(messageElement, storageKey)
            );
        await wait_for_main_thread();
    }
}

function observe_current_chat_scroller(scroller) {
    chat_message_observer?.disconnect();
    chat_message_observer = null;
    chat_observed_scroller = scroller;
    chat_scan_generation += 1;

    if (!scroller) {
        return;
    }

    chat_message_observer = new MutationObserver((mutations) => {
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
                schedule_chat_message_processing(
                    targetElement?.closest?.(CHAT_MESSAGE_ITEM)
                );
            }

            for (const node of mutation.addedNodes) {
                schedule_messages_from_node(node);
            }
        }
    });

    chat_message_observer.observe(scroller, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-sid", "aria-label"]
    });
    const scanGeneration = chat_scan_generation;
    // Protocol cards do not need the chat key, so scan immediately instead of
    // leaving raw public-key payloads visible while storage/WebCrypto resolve.
    scan_chat_messages(scroller, scanGeneration).catch(() => {});
    refresh_cg_chat_cache().catch(() => {});
}

function observe_current_chat_input(chatInput) {
    if (chatInput === chat_observed_chat_input) {
        return;
    }

    if (chat_observed_chat_input) {
        chat_observed_chat_input.removeEventListener("input", sanitize_chat_input);
        chat_observed_chat_input.removeEventListener("focus", sanitize_chat_input);
    }

    chat_observed_chat_input = chatInput;
    if (!chatInput) {
        return;
    }

    chatInput.dataset.ciphergapSanitized = "true";
    chatInput.addEventListener("input", sanitize_chat_input);
    chatInput.addEventListener("focus", sanitize_chat_input);
}

function reconcile_chat_lifecycle() {
    chat_lifecycle_timer = null;
    if (!IS_CHAT_HOST) {
        return;
    }

    const storageKey = get_storage_key();
    const chatChanged = storageKey !== chat_active_storage_key;
    if (chatChanged) {
        chat_chat_opened_at = Date.now();
        chat_auto_file_floor = 0;
        document.querySelectorAll(CHAT_MESSAGE_ITEM).forEach(row => chat_seen_rows.set(row, 1));
        chat_file_bridge_request?.cancel();
        chat_active_storage_key = storageKey;
        invalidate_cg_chat_cache(storageKey);
        refresh_cg_chat_cache().catch(() => {});
        cleanup_stale_exchange_status(storageKey).catch(() => {});
    }
    // A secure selection can invalidate the cache during a very fast URL
    // change, before the debounced lifecycle sees the intermediate chat.
    if (cg_cached_storage_key !== storageKey || !cg_cache_ready) refresh_cg_chat_cache().catch(() => {});

    inject_chat_security_toolbar();
    inject_encrypt_button_chat();

    const chatInput = document.querySelector(CHAT_CHAT_INPUT);
    observe_current_chat_input(chatInput);

    const scroller = document.querySelector(CHAT_MESSAGE_SCROLLER);
    if (scroller !== chat_observed_scroller) {
        observe_current_chat_scroller(scroller);
    } else if (chatChanged && scroller) {
        const scanGeneration = ++chat_scan_generation;
        scan_chat_messages(scroller, scanGeneration).catch(() => {});
        refresh_cg_chat_cache().catch(() => {});
    }
}

function queue_chat_lifecycle_reconcile() {
    if (chat_lifecycle_timer !== null) {
        return;
    }

    chat_lifecycle_timer = setTimeout(reconcile_chat_lifecycle, 50);
}

function node_may_change_chat_lifecycle(node) {
    if (!(node instanceof Element)) {
        return false;
    }

    return node.matches(CHAT_LIFECYCLE_SELECTOR) ||
        Boolean(node.querySelector(CHAT_LIFECYCLE_SELECTOR));
}

function start_chat_lifecycle() {
    if (!IS_CHAT_HOST || chat_lifecycle_started) {
        return;
    }
    chat_lifecycle_started = true;

    document.querySelectorAll('input[type="file"]').forEach(intercept_file_selection);

    chat_lifecycle_observer = new MutationObserver((mutations) => {
        let shouldReconcile = get_storage_key() !== chat_active_storage_key;

        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                hook_file_inputs_in_node(node);
                shouldReconcile ||= node_may_change_chat_lifecycle(node);
            });
            shouldReconcile ||= [...mutation.removedNodes]
                .some(node_may_change_chat_lifecycle);
            shouldReconcile ||= mutation.target instanceof Element &&
                Boolean(mutation.target.closest('[data-ciphergap-composer="true"]'));
        }

        if (shouldReconcile) {
            queue_chat_lifecycle_reconcile();
        }
    });
    chat_lifecycle_observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("popstate", queue_chat_lifecycle_reconcile);
    window.addEventListener("hashchange", queue_chat_lifecycle_reconcile);
    reconcile_chat_lifecycle();
}

for (const platform of Object.values(globalThis.CipherGapShared.chat_platforms)) {
    CHAT_SHARED_ADAPTERS.register(platform.name, {
        hostnames: platform.hostnames,
        // Host detection must survive an SPA replacing or temporarily hiding
        // its editor. Sending checks the current editor separately.
        is_active: () => platform === CHAT_DOM && IS_CHAT_HOST,
        is_in_chat: (url = new URL(window.location.href)) => platform.supports_url(url) && Boolean(platform.chat_id(url)),
        get_chat_storage_suffix: url => platform.supports_url(url) ? platform.chat_id(url) : null,
        send_message: chat_send_message,
        extract_message_text: extract_chat_message_text,
        inject_ui() { inject_chat_security_toolbar(); inject_encrypt_button_chat(); },
        observe_messages: start_chat_lifecycle,
        auto_decrypt_visible_messages,
        clear_input: clear_chat_input,
        choose_secure_files: choose_chat_secure_files
    });
}
if (IS_CHAT_HOST) start_chat_lifecycle();
