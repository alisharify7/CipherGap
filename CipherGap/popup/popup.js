// popup.js

const EXCHANGE_STATUS_EXPIRY_MS = globalThis.CipherGapShared.timeouts
    .exchange_status_ms;
const EXCHANGE_WAIT_TIMEOUT_MS = globalThis.CipherGapShared.timeouts
    .popup_exchange_wait_ms;
const MASKED_KEY = "••••••••••••••••";
const THEME_STORAGE_KEY = globalThis.CipherGapShared.storage_keys.ui_theme;
const COLOR_THEME_QUERY = window.matchMedia("(prefers-color-scheme: dark)");

const versionNumber = document.getElementById("versionNumber");
const themeToggle = document.getElementById("themeToggle");
const siteNameEl = document.getElementById("siteName");
const chatHint = document.getElementById("chatHint");
const chatIdAccessible = document.getElementById("chatIdAccessible");
const contextBadge = document.getElementById("contextBadge");
const unsupportedDescription = document.getElementById("unsupportedDescription");
const compatibilityList = document.getElementById("compatibilityList");
const roadmapCopy = document.getElementById("roadmapCopy");

const securityCard = document.getElementById("securityCard");
const securityHeading = document.getElementById("securityHeading");
const securityViews = Array.from(document.querySelectorAll("[data-security-view]"));
const keyTrustBadge = document.getElementById("keyTrustBadge");
const errorDescription = document.getElementById("errorDescription");
const verifiedDescription = document.getElementById("verifiedDescription");
const exchangeProgress = document.getElementById("exchangeProgress");
const progressSteps = Array.from(exchangeProgress.querySelectorAll("[data-progress-step]"));

const statusEl = document.getElementById("status");
const statusIcon = document.getElementById("statusIcon");
const statusText = document.getElementById("statusText");

const incomingPanel = document.getElementById("incomingPanel");
const incomingFingerprint = document.getElementById("incomingFingerprint");
const sasPanel = document.getElementById("sasPanel");
const sasCode = document.getElementById("sasCode");
const sasCodeAccessible = document.getElementById("sasCodeAccessible");
const sasFingerprint = document.getElementById("sasFingerprint");
const sasWarning = document.getElementById("sasWarning");

const exchangeBtn = document.getElementById("exchangeBtn");
const resumeSasBtn = document.getElementById("resumeSasBtn");
const cancelExchangeBtn = document.getElementById("cancelExchangeBtn");
const acceptExchangeBtn = document.getElementById("acceptExchangeBtn");
const declineExchangeBtn = document.getElementById("declineExchangeBtn");
const sasVerifiedBtn = document.getElementById("sasVerifiedBtn");
const sasMismatchBtn = document.getElementById("sasMismatchBtn");
const sasDismissBtn = document.getElementById("sasDismissBtn");
const staleDismissBtn = document.getElementById("staleDismissBtn");
const securityActions = document.getElementById("securityActions");
const securityActionButtons = Array.from(
    document.querySelectorAll("#securityActions > button")
);

const autoDecryptCard = document.getElementById("autoDecryptCard");
const autoDecryptToggle = document.getElementById("autoDecryptToggle");
const autoFilesToggle = document.getElementById("autoFilesToggle");
const chooseFilesBtn = document.getElementById("chooseFilesBtn");

function select_page(name, focus = false) {
    document.querySelectorAll('[role="tab"]').forEach((tab) => {
        const selected = tab.dataset.page === name;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focus) tab.focus();
    });
    document.querySelectorAll('[role="tabpanel"]').forEach((page) => {
        page.hidden = page.id !== `page-${name}`;
    });
    if (name !== "settings") {
        isKeyRevealed = false;
        render_key_material();
    }
}

document.querySelectorAll('[role="tab"]').forEach((tab, index, tabs) => {
    tab.addEventListener("click", () => select_page(tab.dataset.page));
    tab.addEventListener("keydown", (event) => {
        const offset = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index }[event.key];
        if (offset === undefined) return;
        event.preventDefault();
        select_page(tabs[(index + offset + tabs.length) % tabs.length].dataset.page, true);
    });
});
document.querySelectorAll('[data-go-page]').forEach((button) => {
    button.addEventListener("click", () => select_page(button.dataset.goPage, true));
});

const manageKeyDetails = document.getElementById("manageKeyDetails");
const fingerprintGroup = document.getElementById("fingerprintGroup");
const currentFingerprint = document.getElementById("currentFingerprint");
const oldFingerprint = document.getElementById("oldFingerprint");
const keyMaterial = document.getElementById("keyMaterial");
const savedKeyEl = document.getElementById("savedKey");
const savedKeyAccessible = document.getElementById("savedKeyAccessible");
const revealKeyBtn = document.getElementById("revealKeyBtn");
const copyKeyBtn = document.getElementById("copyKeyBtn");
const replaceKeyBtn = document.getElementById("replaceKeyBtn");
const clearKeyBtn = document.getElementById("clearKeyBtn");

const manualKeyDetails = document.getElementById("manualKeyDetails");
const manualKeyForm = document.getElementById("manualKeyForm");
const secretKeyInput = document.getElementById("secretKey");
const manualKeyError = document.getElementById("manualKeyError");
const saveBtn = document.getElementById("saveBtn");

const confirmationDialog = document.getElementById("confirmationDialog");
const confirmationTitle = document.getElementById("confirmationTitle");
const confirmationMessage = document.getElementById("confirmationMessage");
const confirmationActionBtn = document.getElementById("confirmationActionBtn");
const confirmationCancelBtn = document.getElementById("confirmationCancelBtn");

let currentHostname = null;
let currentChatId = null;
let currentMessenger = null;
let storageKey = null;
let activeTabId = null;
let currentSecretKey = "";
let currentTrust = null;
let currentExchangeStatus = null;
let isKeyRevealed = false;
let dismissedSasNonce = null;
const intentionalExchangeRemovalNonces = new Set();
let storageListenerRegistered = false;
let followsSystemTheme = true;
let popupContextState = "loading";
let initializationErrorMessage = "";
let expiredPendingNotice = false;
let renderedPopupState = { view: "loading", canResumeSas: false };
let lastAnnouncedExternalState = "";
let externalAnnouncementSuppressionDepth = 0;

function get_system_theme() {
    return COLOR_THEME_QUERY.matches ? "dark" : "light";
}

function read_saved_theme() {
    try {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        return ["light", "dark"].includes(savedTheme) ? savedTheme : null;
    } catch (error) {
        console.warn("[CipherGap] Could not read the saved theme:", error);
        return null;
    }
}

function apply_theme(theme) {
    const resolvedTheme = theme === "dark" ? "dark" : "light";
    const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = resolvedTheme;
    themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    themeToggle.title = `Switch to ${nextTheme} theme`;
}

function initialize_theme() {
    const savedTheme = read_saved_theme();
    followsSystemTheme = !savedTheme;
    apply_theme(savedTheme || get_system_theme());

    COLOR_THEME_QUERY.addEventListener("change", () => {
        if (followsSystemTheme) {
            apply_theme(get_system_theme());
        }
    });
}

function handle_theme_toggle() {
    const nextTheme = document.documentElement.dataset.theme === "dark"
        ? "light"
        : "dark";

    followsSystemTheme = false;
    apply_theme(nextTheme);

    try {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (error) {
        console.warn("[CipherGap] Could not save the selected theme:", error);
    }
}

function get_trust_storage_key() {
    return storageKey
        ? globalThis.CipherGapShared.storage_keys.key_trust(storageKey)
        : null;
}

function get_exchange_storage_key() {
    return storageKey
        ? globalThis.CipherGapShared.storage_keys.exchange_status(storageKey)
        : null;
}

function get_current_messenger_label() {
    const definition = currentMessenger
        ? globalThis.CipherGapShared.messengers.definitions[currentMessenger]
        : globalThis.CipherGapShared.messengers.get_by_hostname(currentHostname);
    return definition?.display_name || "messenger";
}

function can_manage_chat() {
    return Boolean(
        popupContextState === "ready" &&
        currentMessenger &&
        currentChatId &&
        storageKey &&
        Number.isInteger(activeTabId)
    );
}

function get_error_message(error, fallback) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === "string" && error) {
        return error;
    }
    return fallback;
}

function create_cancelled_exchange_error() {
    const error = new Error("The key exchange was cancelled.");
    error.name = "AbortError";
    return error;
}

function set_status(message, tone = "neutral") {
    const icons = {
        neutral: "•",
        progress: "…",
        success: "✓",
        warning: "!",
        error: "×"
    };

    statusEl.dataset.empty = "false";
    statusEl.dataset.tone = tone;
    statusIcon.textContent = icons[tone] ?? icons.neutral;
    statusText.textContent = message;
    if (tone === "success") {
        setTimeout(() => {
            if (statusText.textContent === message && statusEl.dataset.tone === "success") clear_status();
        }, 5000);
    }
}

function clear_status() {
    statusEl.dataset.empty = "true";
    statusEl.dataset.tone = "neutral";
    statusIcon.textContent = "•";
    statusText.textContent = "";
}

function set_button_busy(button, busy) {
    if (busy) {
        button.setAttribute("aria-busy", "true");
        button.disabled = true;
        return;
    }

    button.removeAttribute("aria-busy");
}

function is_button_busy(button) {
    return button.getAttribute("aria-busy") === "true";
}

function render_manifest_version() {
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version_name || manifest.version;
    versionNumber.textContent = `v${version}`;
    versionNumber.setAttribute("aria-label", `CipherGap version ${version}`);
}

function format_name_list(names) {
    if (names.length < 2) {
        return names[0] || "a supported messenger";
    }
    if (names.length === 2) {
        return `${names[0]} and ${names[1]}`;
    }
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function get_messenger_context_status(messengerId) {
    if (messengerId !== currentMessenger) {
        return "Supported";
    }

    return {
        ready: "Ready in this chat",
        "no-chat": "Open a chat",
        error: "Needs refresh"
    }[popupContextState] || "Supported";
}

function render_compatibility() {
    const definitions = Object.values(
        globalThis.CipherGapShared.messengers.definitions
    );
    const fragment = document.createDocumentFragment();

    for (const definition of definitions) {
        const row = document.createElement("div");
        row.className = "about-row";

        const dot = document.createElement("span");
        dot.className = "messenger-dot";
        dot.dataset.supported = "true";
        dot.setAttribute("aria-hidden", "true");

        const text = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = definition.display_name;
        const status = document.createElement("small");
        status.textContent = get_messenger_context_status(definition.id);
        text.append(name, status);
        row.append(dot, text);
        fragment.appendChild(row);
    }

    compatibilityList.replaceChildren(fragment);
    const plannedNames = globalThis.CipherGapShared.messengers.roadmap
        .map((messenger) => messenger.display_name);
    roadmapCopy.hidden = plannedNames.length === 0;
    roadmapCopy.textContent = plannedNames.length > 0
        ? `Coming soon: ${format_name_list(plannedNames)}`
        : "";

    return definitions.map((definition) => definition.display_name);
}

function update_current_chat_ui() {
    chatIdAccessible.textContent = "";
    const messengerLabel = get_current_messenger_label();
    const supportedMessengerNames = render_compatibility();

    if (popupContextState === "loading") {
        siteNameEl.textContent = "Checking the active tab…";
        chatHint.textContent = "Looking for an open supported conversation.";
        contextBadge.textContent = "Checking";
        contextBadge.dataset.tone = "neutral";
        return;
    }

    if (popupContextState === "ready" && currentChatId) {
        const chatId = String(currentChatId);
        const shortId = chatId.length > 8 ? chatId.slice(-8) : chatId;
        siteNameEl.textContent = `Current ${messengerLabel} chat`;
        chatHint.textContent = `Chat ID ending ${shortId} · Settings apply only to this conversation.`;
        chatIdAccessible.textContent = `Stable chat identifier: ${chatId}.`;
        contextBadge.textContent = "Ready";
        contextBadge.dataset.tone = "ready";
        return;
    }

    if (popupContextState === "no-chat") {
        siteNameEl.textContent = `${messengerLabel} · No chat selected`;
        chatHint.textContent = "Select a conversation, then reopen CipherGap.";
        contextBadge.textContent = "Choose chat";
        contextBadge.dataset.tone = "warning";
        return;
    }

    if (popupContextState === "error") {
        siteNameEl.textContent = "Chat context unavailable";
        chatHint.textContent = `Refresh ${messengerLabel}, then reopen CipherGap.`;
        contextBadge.textContent = "Error";
        contextBadge.dataset.tone = "danger";
        return;
    }

    siteNameEl.textContent = currentHostname || "Unsupported browser page";
    const supportedNames = format_name_list(supportedMessengerNames);
    chatHint.textContent = `CipherGap currently works in supported chats on ${supportedNames}.`;
    unsupportedDescription.textContent =
        `CipherGap currently protects conversations on ${supportedNames}. Open a supported chat, then reopen this popup.`;
    contextBadge.textContent = "Unsupported";
    contextBadge.dataset.tone = "warning";
}

function get_effective_trust_state() {
    if (!currentSecretKey) {
        return "none";
    }

    if (currentTrust?.state === "verified") {
        return "verified";
    }

    if (currentTrust?.state === "changed" || currentExchangeStatus?.fingerprintWarning) {
        return "changed";
    }

    return "unverified";
}

function has_current_eligible_sas() {
    const entry = currentExchangeStatus;
    const trust = currentTrust;

    return Boolean(
        currentSecretKey &&
        entry?.status === "complete" &&
        entry.nonce &&
        globalThis.CipherGapShared.protocol.is_valid_sas(entry.sas) &&
        entry.fingerprint &&
        trust?.source === "exchange" &&
        trust.nonce === entry.nonce &&
        trust.fingerprint === entry.fingerprint &&
        ["unverified", "changed"].includes(trust.state)
    );
}

function resolve_popup_view_state({
    contextState,
    exchangeStatus,
    hasExpiredNotice,
    trustState,
    hasKey,
    hasEligibleSas,
    sasDismissed
}) {
    if (contextState === "loading") {
        return { view: "loading", canResumeSas: false };
    }
    if (contextState === "unsupported") {
        return { view: "unsupported", canResumeSas: false };
    }
    if (contextState === "no-chat") {
        return { view: "no-chat", canResumeSas: false };
    }
    if (contextState === "error") {
        return { view: "error", canResumeSas: false };
    }

    if (exchangeStatus === "incoming") {
        return { view: "incoming", canResumeSas: false };
    }
    if (exchangeStatus === "waiting") {
        return { view: "waiting", canResumeSas: false };
    }
    if (hasExpiredNotice) {
        return { view: "expired", canResumeSas: false };
    }

    if (trustState === "changed") {
        if (hasEligibleSas && !sasDismissed) {
            return {
                view: "changed",
                panel: "sas",
                canResumeSas: false,
                fingerprintChanged: true
            };
        }
        return {
            view: "changed",
            canResumeSas: Boolean(hasEligibleSas && sasDismissed),
            fingerprintChanged: true
        };
    }

    if (hasEligibleSas && !sasDismissed) {
        return { view: "sas", canResumeSas: false, fingerprintChanged: false };
    }
    if (trustState === "verified") {
        return { view: "verified", canResumeSas: false };
    }
    if (hasKey) {
        return {
            view: "unverified",
            canResumeSas: Boolean(hasEligibleSas && sasDismissed)
        };
    }
    return { view: "no-key", canResumeSas: false };
}

function resolve_current_popup_state() {
    const eligibleSas = has_current_eligible_sas();
    const nonce = currentExchangeStatus?.nonce || null;

    return resolve_popup_view_state({
        contextState: popupContextState,
        exchangeStatus: currentExchangeStatus?.status || null,
        hasExpiredNotice: expiredPendingNotice,
        trustState: get_effective_trust_state(),
        hasKey: Boolean(currentSecretKey),
        hasEligibleSas: eligibleSas,
        sasDismissed: Boolean(eligibleSas && dismissedSasNonce === nonce)
    });
}

function format_verified_date(timestamp) {
    if (!Number.isFinite(timestamp)) {
        return "";
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(timestamp));
}

function render_key_material() {
    const hasKey = Boolean(currentSecretKey);
    keyMaterial.hidden = !hasKey;

    if (!hasKey) {
        savedKeyEl.textContent = "";
        savedKeyAccessible.textContent = "No encryption key saved";
        revealKeyBtn.textContent = "Reveal";
        revealKeyBtn.setAttribute("aria-pressed", "false");
        return;
    }

    savedKeyEl.textContent = isKeyRevealed ? currentSecretKey : MASKED_KEY;
    savedKeyAccessible.textContent = isKeyRevealed
        ? `Encryption key: ${currentSecretKey}`
        : "Encryption key hidden";
    revealKeyBtn.textContent = isKeyRevealed ? "Hide" : "Reveal";
    revealKeyBtn.setAttribute("aria-pressed", String(isKeyRevealed));
}

function render_fingerprint_details() {
    const trustState = get_effective_trust_state();
    const fingerprint = currentTrust?.fingerprint || currentExchangeStatus?.fingerprint || "";
    const previousFingerprint = currentTrust?.oldFingerprint ||
        currentExchangeStatus?.oldFingerprint ||
        "";

    fingerprintGroup.hidden = !fingerprint;
    currentFingerprint.textContent = fingerprint;
    oldFingerprint.hidden = !previousFingerprint || trustState !== "changed";
    oldFingerprint.textContent = previousFingerprint
        ? `Previous fingerprint: ${previousFingerprint}`
        : "";
}

function render_sas_data(state) {
    const entry = currentExchangeStatus;
    const rawCode = String(entry?.sas || "");
    const hasCode = globalThis.CipherGapShared.protocol.is_valid_sas(rawCode);
    const formattedCode = hasCode
        ? globalThis.CipherGapShared.protocol.format_protocol_digits(rawCode)
        : "——— ———";

    sasCode.textContent = formattedCode;
    sasCodeAccessible.textContent = hasCode
        ? `SAS verification code ${globalThis.CipherGapShared.protocol.speak_protocol_digits(rawCode)}`
        : "SAS verification code unavailable";

    const fingerprint = currentTrust?.fingerprint || entry?.fingerprint || "";
    sasFingerprint.hidden = !fingerprint;
    sasFingerprint.textContent = fingerprint ? `Fingerprint: ${fingerprint}` : "";
    sasWarning.hidden = !state.fingerprintChanged;
}

function render_exchange_progress(view) {
    const stepOrder = ["request", "compare", "protected"];
    const currentIndex = view === "waiting" ? 0 : 1;
    const isVisible = view === "waiting" || view === "sas";

    exchangeProgress.hidden = !isVisible;
    if (!isVisible) {
        return;
    }

    progressSteps.forEach((step, index) => {
        const stepState = index < currentIndex
            ? "complete"
            : index === currentIndex
                ? "current"
                : "upcoming";
        const visibleLabel = step.querySelector(".step-label")?.textContent || stepOrder[index];

        step.dataset.stepState = stepState;
        step.setAttribute(
            "aria-label",
            `${stepState === "complete" ? "Completed" : stepState === "current" ? "Current step" : "Upcoming"}: ${visibleLabel}`
        );

        if (stepState === "current") {
            step.setAttribute("aria-current", "step");
        } else {
            step.removeAttribute("aria-current");
        }
    });
}

function show_security_action(button, label) {
    button.hidden = false;
    if (label) {
        button.textContent = label;
    }
}

function render_security_actions(state) {
    securityActionButtons.forEach((button) => {
        button.hidden = true;
    });

    switch (state.panel || state.view) {
        case "no-key":
            show_security_action(exchangeBtn, "Set up secure chat");
            break;
        case "waiting":
            show_security_action(cancelExchangeBtn, "Cancel request");
            break;
        case "incoming":
            show_security_action(acceptExchangeBtn, "Accept request");
            show_security_action(declineExchangeBtn, "Decline");
            break;
        case "sas":
            show_security_action(sasVerifiedBtn, "Codes match — verify");
            show_security_action(sasMismatchBtn, "Codes don’t match");
            show_security_action(sasDismissBtn, "Verify later");
            break;
        case "changed":
            if (state.canResumeSas) {
                show_security_action(resumeSasBtn, "Resume verification");
            } else {
                show_security_action(exchangeBtn, "Exchange again to verify");
            }
            break;
        case "unverified":
            if (state.canResumeSas) {
                show_security_action(resumeSasBtn, "Resume verification");
            } else {
                show_security_action(exchangeBtn, "Exchange again to verify");
            }
            break;
        case "expired":
            show_security_action(exchangeBtn, "Try again");
            show_security_action(staleDismissBtn, "Dismiss");
            break;
        default:
            break;
    }

    securityActions.hidden = securityActionButtons.every((button) => button.hidden);
}

function render_action_availability() {
    const ready = can_manage_chat();
    const exchangeActive = ["waiting", "incoming"].includes(currentExchangeStatus?.status);
    const acceptOrDeclineBusy = is_button_busy(acceptExchangeBtn) ||
        is_button_busy(declineExchangeBtn);
    const sasActionBusy = is_button_busy(sasVerifiedBtn) ||
        is_button_busy(sasMismatchBtn);

    exchangeBtn.disabled = !ready || exchangeActive || is_button_busy(exchangeBtn);
    replaceKeyBtn.disabled = !ready || !currentSecretKey || exchangeActive || is_button_busy(replaceKeyBtn);
    cancelExchangeBtn.disabled = !ready ||
        currentExchangeStatus?.status !== "waiting" ||
        is_button_busy(cancelExchangeBtn);
    acceptExchangeBtn.disabled = !ready ||
        currentExchangeStatus?.status !== "incoming" ||
        acceptOrDeclineBusy;
    declineExchangeBtn.disabled = !ready ||
        currentExchangeStatus?.status !== "incoming" ||
        acceptOrDeclineBusy;
    sasVerifiedBtn.disabled = !ready || !has_current_eligible_sas() || sasActionBusy;
    sasMismatchBtn.disabled = !ready || !has_current_eligible_sas() || sasActionBusy;
    sasDismissBtn.disabled = !ready || !has_current_eligible_sas() || sasActionBusy;
    resumeSasBtn.disabled = !ready || !has_current_eligible_sas();

    secretKeyInput.disabled = !ready || exchangeActive || is_button_busy(saveBtn);
    saveBtn.disabled = !ready || exchangeActive || is_button_busy(saveBtn);
    autoDecryptToggle.disabled = !ready || is_button_busy(autoDecryptToggle);
    autoFilesToggle.disabled = !ready || !currentSecretKey || is_button_busy(autoFilesToggle);
    chooseFilesBtn.disabled = !ready || !currentSecretKey;
    document.getElementById("fileKeyHint").textContent = currentSecretKey
        ? "Up to 100 MB combined · Bale previews encrypted files only"
        : "Set up a key in Security before sending files.";
    revealKeyBtn.disabled = !ready || !currentSecretKey;
    copyKeyBtn.disabled = !ready || !currentSecretKey;
    clearKeyBtn.disabled = !ready ||
        !currentSecretKey ||
        exchangeActive ||
        is_button_busy(clearKeyBtn);
}

function render_disclosures() {
    const ready = can_manage_chat();
    const showManageKey = ready && Boolean(currentSecretKey);

    autoDecryptCard.hidden = !ready;
    manageKeyDetails.hidden = !showManageKey;
    manualKeyDetails.hidden = !ready;

    if (!showManageKey) {
        manageKeyDetails.open = false;
    }
    if (manualKeyDetails.hidden) {
        manualKeyDetails.open = false;
    }
}

function render_badge(state) {
    const badgeByView = {
        loading: ["Checking", "neutral"],
        unsupported: ["Unavailable", "neutral"],
        "no-chat": ["No chat", "warning"],
        error: ["Error", "danger"],
        "no-key": ["Not protected", "warning"],
        waiting: ["In progress", "info"],
        incoming: ["Action needed", "warning"],
        sas: [state.fingerprintChanged ? "Changed" : "Unverified", state.fingerprintChanged ? "danger" : "warning"],
        changed: ["Fingerprint changed", "danger"],
        unverified: ["Unverified", "warning"],
        verified: ["Protected", "success"],
        expired: ["Expired", "warning"]
    };
    const [label, tone] = badgeByView[state.view] || badgeByView.loading;

    keyTrustBadge.textContent = label;
    keyTrustBadge.dataset.tone = tone;
    securityCard.dataset.tone = tone;
}

function render_popup() {
    update_current_chat_ui();

    const state = resolve_current_popup_state();
    renderedPopupState = state;
    securityCard.dataset.view = state.view;
    document.getElementById("page-security").dataset.state = state.panel || state.view;

    const activePanel = state.panel || state.view;

    securityViews.forEach((view) => {
        view.hidden = view.dataset.securityView !== activePanel;
    });

    if (state.view === "error") {
        errorDescription.textContent = initializationErrorMessage ||
            `Refresh ${get_current_messenger_label()} and try opening CipherGap again.`;
    }

    if (state.view === "verified") {
        const verifiedAt = format_verified_date(currentTrust?.verifiedAt || currentTrust?.at);
        verifiedDescription.textContent = verifiedAt
            ? `The key and partner fingerprint were verified on ${verifiedAt}.`
            : "The key and partner fingerprint have been verified.";
    }

    if (state.view === "incoming") {
        incomingFingerprint.textContent = currentExchangeStatus?.fingerprint || "Not available yet";
    }

    render_sas_data(state);
    render_badge(state);
    render_exchange_progress(activePanel);
    render_security_actions(state);
    render_fingerprint_details();
    render_key_material();
    render_disclosures();
    render_action_availability();

    return state;
}

function focus_active_view_heading() {
    select_page("security");
    requestAnimationFrame(() => {
        securityHeading.focus();
    });
}

function is_exchange_expired(entry) {
    if (!entry || !Number.isFinite(entry.at)) {
        return false;
    }
    return Date.now() - entry.at > EXCHANGE_STATUS_EXPIRY_MS;
}

async function refresh_popup_state({ announceStale = false } = {}) {
    if (!storageKey) {
        currentSecretKey = "";
        currentTrust = null;
        currentExchangeStatus = null;
        isKeyRevealed = false;
        render_popup();
        return;
    }

    const trustStorageKey = get_trust_storage_key();
    const exchangeStorageKey = get_exchange_storage_key();
    const result = await chrome.storage.local.get([
        storageKey,
        trustStorageKey,
        exchangeStorageKey
    ]);
    const nextKey = result[storageKey] || "";
    let nextExchange = result[exchangeStorageKey] || null;

    if (nextExchange && is_exchange_expired(nextExchange)) {
        const wasPending = ["waiting", "incoming"].includes(nextExchange.status);
        await chrome.storage.local.remove(exchangeStorageKey);
        nextExchange = null;

        if (announceStale && wasPending) {
            expiredPendingNotice = true;
        }
    } else if (nextExchange) {
        expiredPendingNotice = false;
    }

    if (nextKey !== currentSecretKey) {
        isKeyRevealed = false;
    }

    currentSecretKey = nextKey;
    currentTrust = result[trustStorageKey] || null;
    currentExchangeStatus = nextExchange;
    render_popup();
}

function announce_external_state(previousState, nextState) {
    const nonce = currentExchangeStatus?.nonce || "none";
    let token = "";
    let message = "";
    let tone = "warning";

    if (nextState.view === "incoming") {
        token = `incoming:${nonce}`;
        message = "Your partner requested a key exchange. Review the request in Chat security.";
    } else if ((nextState.panel || nextState.view) === "sas") {
        token = `${nextState.fingerprintChanged ? "changed" : "sas"}:${nonce}`;
        message = nextState.fingerprintChanged
            ? "The partner fingerprint changed. Compare the verification code before continuing."
            : "Key exchange complete. Compare the verification code with your partner.";
    } else if (nextState.view === "changed" && previousState.view !== "changed") {
        token = `changed:${currentTrust?.fingerprint || nonce}`;
        message = "The partner fingerprint changed. Exchange again before sending sensitive messages.";
    } else if (nextState.view === "expired" && previousState.view !== "expired") {
        token = "expired";
        message = "The previous key exchange expired. You can safely try again.";
    }

    if (!token || token === lastAnnouncedExternalState) {
        return;
    }

    lastAnnouncedExternalState = token;
    set_status(message, tone);
}

function mark_current_external_state_announced() {
    const nonce = currentExchangeStatus?.nonce || "none";
    const activePanel = renderedPopupState.panel || renderedPopupState.view;

    if (renderedPopupState.view === "incoming") {
        lastAnnouncedExternalState = `incoming:${nonce}`;
    } else if (activePanel === "sas") {
        lastAnnouncedExternalState = `${renderedPopupState.fingerprintChanged ? "changed" : "sas"}:${nonce}`;
    } else if (renderedPopupState.view === "changed") {
        lastAnnouncedExternalState = `changed:${currentTrust?.fingerprint || nonce}`;
    } else if (renderedPopupState.view === "expired") {
        lastAnnouncedExternalState = "expired";
    }
}

function register_storage_listener() {
    if (storageListenerRegistered) {
        return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        handle_storage_changes(changes, areaName).catch((error) => {
            console.error("[CipherGap] Popup storage refresh failed:", error);
            set_status("CipherGap could not refresh the latest chat state.", "error");
        });
    });
    storageListenerRegistered = true;
}

async function handle_storage_changes(changes, areaName) {
    if (areaName !== "local" || !storageKey) {
        return;
    }

    const relevantKeys = [
        storageKey,
        get_trust_storage_key(),
        get_exchange_storage_key()
    ];
    if (!relevantKeys.some((key) => Object.hasOwn(changes, key))) {
        return;
    }

    const exchangeChange = changes[get_exchange_storage_key()];
    if (
        exchangeChange &&
        !exchangeChange.newValue &&
        ["waiting", "incoming"].includes(exchangeChange.oldValue?.status) &&
        !intentionalExchangeRemovalNonces.has(exchangeChange.oldValue?.nonce)
    ) {
        expiredPendingNotice = true;
    }

    const previousState = renderedPopupState;
    await refresh_popup_state({ announceStale: true });
    if (externalAnnouncementSuppressionDepth === 0) {
        announce_external_state(previousState, renderedPopupState);
    }
}

async function send_tab_message(message) {
    const messengerLabel = get_current_messenger_label();
    if (!Number.isInteger(activeTabId)) {
        throw new Error(`Open a ${messengerLabel} chat, then reopen CipherGap.`);
    }

    try {
        return await chrome.tabs.sendMessage(activeTabId, {
            ...message,
            expectedStorageKey: storageKey
        });
    } catch (error) {
        console.error("[CipherGap] Could not reach the messenger content script:", error);
        throw new Error(
            `CipherGap is not ready on this ${messengerLabel} tab. Reload it and try again.`
        );
    }
}

function can_restore_focus(element) {
    return Boolean(
        element?.isConnected &&
        !element.hidden &&
        !element.disabled &&
        !element.closest?.("[hidden]") &&
        element.getClientRects().length
    );
}

function show_confirmation({ title, message, confirmLabel }) {
    if (confirmationDialog.open) {
        confirmationDialog.close("cancel");
    }

    const invoker = document.activeElement;
    confirmationTitle.textContent = title;
    confirmationMessage.textContent = message;
    confirmationActionBtn.textContent = confirmLabel;
    confirmationDialog.returnValue = "cancel";
    confirmationDialog.showModal();

    queueMicrotask(() => confirmationCancelBtn.focus());

    return new Promise((resolve) => {
        confirmationDialog.addEventListener(
            "close",
            () => {
                const confirmed = confirmationDialog.returnValue === "confirm";
                if (!confirmed) {
                    if (can_restore_focus(invoker)) {
                        requestAnimationFrame(() => invoker.focus());
                    } else {
                        focus_active_view_heading();
                    }
                }
                resolve(confirmed);
            },
            { once: true }
        );
    });
}

async function copy_secret_key() {
    if (!currentSecretKey) {
        return;
    }

    try {
        await navigator.clipboard.writeText(currentSecretKey);
    } catch {
        const helper = document.createElement("textarea");
        helper.className = "clipboard-helper";
        helper.value = currentSecretKey;
        helper.setAttribute("readonly", "");
        document.body.appendChild(helper);
        helper.select();
        const copied = document.execCommand("copy");
        helper.remove();
        copyKeyBtn.focus();

        if (!copied) {
            throw new Error("The browser blocked clipboard access.");
        }
    }

    set_status("Key copied. Keep it private and clear your clipboard when finished.", "success");
}

function create_manual_trust() {
    return {
        state: "unverified",
        source: "manual",
        at: Date.now()
    };
}

function clear_manual_key_error() {
    secretKeyInput.removeAttribute("aria-invalid");
    manualKeyError.hidden = true;
    manualKeyError.textContent = "";
}

async function handle_manual_key_submit(event) {
    event.preventDefault();

    if (!can_manage_chat()) {
        set_status(
            `Open a ${get_current_messenger_label()} chat before saving a key.`,
            "error"
        );
        return;
    }

    if (["waiting", "incoming"].includes(currentExchangeStatus?.status)) {
        set_status("Finish or decline the current key exchange before saving a manual key.", "warning");
        return;
    }

    const key = secretKeyInput.value.trim();
    if (!key) {
        secretKeyInput.setAttribute("aria-invalid", "true");
        manualKeyError.textContent = "Enter a shared key before saving.";
        manualKeyError.hidden = false;
        set_status("Enter a shared key before saving.", "error");
        secretKeyInput.focus();
        return;
    }
    clear_manual_key_error();

    if (currentSecretKey && key === currentSecretKey) {
        secretKeyInput.value = "";
        manualKeyDetails.open = false;
        set_status(
            get_effective_trust_state() === "verified"
                ? "That key is already saved. Its verified state was preserved."
                : "That key is already saved. Its trust state was left unchanged.",
            get_effective_trust_state() === "verified" ? "success" : "warning"
        );
        focus_active_view_heading();
        return;
    }

    if (currentSecretKey) {
        const shouldReplace = await show_confirmation({
            title: "Replace the current key?",
            message: "Existing encrypted messages may no longer decrypt with the new key. Continue only if your partner will use the same replacement key.",
            confirmLabel: "Replace key"
        });

        if (!shouldReplace) {
            return;
        }
    }

    if (["waiting", "incoming"].includes(currentExchangeStatus?.status)) {
        set_status("The exchange state changed while you were reviewing the replacement. Finish that exchange first.", "warning");
        return;
    }

    set_button_busy(saveBtn, true);
    set_status("Saving the manual key…", "progress");

    try {
        await chrome.storage.local.set({
            [storageKey]: key,
            [get_trust_storage_key()]: create_manual_trust()
        });
        await chrome.storage.local.remove(get_exchange_storage_key());

        expiredPendingNotice = false;
        dismissedSasNonce = null;
        secretKeyInput.value = "";
        clear_manual_key_error();
        manualKeyDetails.open = false;
        await refresh_popup_state();
        set_status("Manual key saved. It remains unverified until you confirm it with your partner.", "warning");
        focus_active_view_heading();
    } catch (error) {
        console.error("[CipherGap] Manual key save failed:", error);
        set_status(get_error_message(error, "The key could not be saved."), "error");
    } finally {
        set_button_busy(saveBtn, false);
        render_popup();
    }
}

async function clear_current_key({
    triggerButton,
    title,
    message,
    confirmLabel,
    progressMessage,
    successMessage,
    expectedNonce = null,
    expectedTrust = null
}) {
    if (!currentSecretKey) {
        return;
    }

    const keyBeingCleared = currentSecretKey;
    const shouldClear = await show_confirmation({ title, message, confirmLabel });

    if (!shouldClear) {
        return;
    }

    let latestState;
    try {
        latestState = await chrome.storage.local.get([
            storageKey,
            get_trust_storage_key(),
            get_exchange_storage_key()
        ]);
    } catch (error) {
        console.error("[CipherGap] Could not re-check the key before clearing:", error);
        set_status("The latest key state could not be checked. Nothing was removed.", "error");
        return;
    }

    const latestExchange = latestState[get_exchange_storage_key()] || null;
    const latestTrust = latestState[get_trust_storage_key()] || null;
    if (
        latestState[storageKey] !== keyBeingCleared ||
        ["waiting", "incoming"].includes(latestExchange?.status) ||
        (expectedNonce && latestExchange?.nonce !== expectedNonce) ||
        (expectedTrust && (
            latestTrust?.source !== expectedTrust.source ||
            latestTrust?.state !== expectedTrust.state ||
            latestTrust?.nonce !== expectedTrust.nonce ||
            latestTrust?.fingerprint !== expectedTrust.fingerprint ||
            latestTrust?.codecId !== expectedTrust.codecId
        ))
    ) {
        await refresh_popup_state().catch(() => {});
        set_status("The key or exchange state changed while you were reviewing this action. Check the current state and try again.", "warning");
        return;
    }

    set_button_busy(triggerButton, true);
    set_status(progressMessage, "progress");

    try {
        const clearMessage = {
            action: "clear_key",
            expectedKey: keyBeingCleared
        };
        if (expectedNonce) {
            clearMessage.expectedNonce = expectedNonce;
        }
        if (expectedTrust) {
            clearMessage.expectedTrust = expectedTrust;
        }

        const response = await send_tab_message(clearMessage);
        if (!response?.ok) {
            throw new Error(response?.error || "The key could not be cleared.");
        }

        // Deliberately preserve peer_fp_* so a later exchange can still detect
        // an unexpected partner-fingerprint change.
        await chrome.storage.local.remove([
            get_trust_storage_key(),
            get_exchange_storage_key()
        ]);

        currentSecretKey = "";
        currentTrust = null;
        currentExchangeStatus = null;
        isKeyRevealed = false;
        dismissedSasNonce = null;
        expiredPendingNotice = false;
        secretKeyInput.value = "";
        clear_manual_key_error();
        manageKeyDetails.open = false;
        render_popup();
        set_status(successMessage, "warning");
        focus_active_view_heading();
    } catch (error) {
        console.error("[CipherGap] Clear key failed:", error);
        set_status(get_error_message(error, "The key could not be cleared."), "error");
    } finally {
        set_button_busy(triggerButton, false);
        render_popup();
    }
}

function handle_clear_key() {
    return clear_current_key({
        triggerButton: clearKeyBtn,
        title: "Clear this chat key?",
        message: "You will not be able to read or send encrypted messages in this chat until you set up another key.",
        confirmLabel: "Clear key",
        progressMessage: "Clearing this chat key…",
        successMessage: "Key cleared for this chat."
    });
}

function handle_sas_mismatch() {
    if (!has_current_eligible_sas()) {
        set_status("This verification code is no longer current. Review the latest chat security state.", "warning");
        return;
    }

    const expectedTrust = {
        source: currentTrust.source,
        state: currentTrust.state,
        nonce: currentTrust.nonce,
        fingerprint: currentTrust.fingerprint,
        codecId: currentTrust.codecId
    };

    return clear_current_key({
        triggerButton: sasMismatchBtn,
        title: "Codes don’t match?",
        message: "The unverified chat key will be removed. CipherGap will keep the known fingerprint history so a future change can still be detected.",
        confirmLabel: "Remove unsafe key",
        progressMessage: "Removing the unverified key…",
        successMessage: "The mismatched key was removed. Set up a new exchange before continuing.",
        expectedNonce: currentExchangeStatus.nonce,
        expectedTrust
    });
}

function resolve_exchange_result(key, entry, trust) {
    return {
        key,
        status: entry,
        trust,
        sas: entry?.sas || null,
        fingerprint: trust?.fingerprint || entry?.fingerprint || null,
        fingerprintWarning: trust?.state === "changed" || Boolean(entry?.fingerprintWarning)
    };
}

function wait_for_exchange_complete(key, timeoutMs = EXCHANGE_WAIT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const exchangeStorageKey = globalThis.CipherGapShared.storage_keys
            .exchange_status(key);
        const trustStorageKey = globalThis.CipherGapShared.storage_keys
            .key_trust(key);
        let settled = false;
        let timeoutId = null;

        const cleanup = () => {
            chrome.storage.onChanged.removeListener(on_storage_changed);
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
        };

        const finish = (callback, value) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            callback(value);
        };

        const inspect_status = async (entry) => {
            if (!entry || settled) {
                return;
            }

            if (["declined", "cancelled", "error"].includes(entry.status)) {
                if (entry.status === "cancelled" && intentionalExchangeRemovalNonces.has(entry.nonce)) {
                    finish(reject, create_cancelled_exchange_error());
                } else {
                    finish(reject, new Error(entry.error || "The key exchange was declined."));
                }
                return;
            }

            if (entry.status !== "complete") {
                return;
            }

            try {
                const result = await chrome.storage.local.get([
                    key,
                    exchangeStorageKey,
                    trustStorageKey
                ]);
                const completedEntry = result[exchangeStorageKey] || entry;

                if (result[key]) {
                    finish(
                        resolve,
                        resolve_exchange_result(
                            result[key],
                            completedEntry,
                            result[trustStorageKey] || null
                        )
                    );
                }
            } catch (error) {
                finish(reject, error);
            }
        };

        function on_storage_changed(changes, areaName) {
            if (areaName !== "local" || !changes[exchangeStorageKey]) {
                return;
            }

            const change = changes[exchangeStorageKey];
            if (
                !change.newValue &&
                change.oldValue?.status === "waiting" &&
                intentionalExchangeRemovalNonces.has(change.oldValue.nonce)
            ) {
                finish(reject, create_cancelled_exchange_error());
                return;
            }

            inspect_status(change.newValue).catch((error) => {
                finish(reject, error);
            });
        }

        chrome.storage.onChanged.addListener(on_storage_changed);

        timeoutId = setTimeout(async () => {
            try {
                const latest = await chrome.storage.local.get([exchangeStorageKey]);
                const entry = latest[exchangeStorageKey];

                if (entry?.status === "complete") {
                    await inspect_status(entry);
                    if (settled) {
                        return;
                    }
                }

                if (entry?.status === "waiting") {
                    const cancelResponse = await send_tab_message({
                        action: "cancel_key_exchange",
                        nonce: entry.nonce
                    }).catch((error) => {
                        console.warn("[CipherGap] Content-side exchange cancellation failed:", error);
                        return null;
                    });

                    if (cancelResponse?.completed) {
                        const completed = await chrome.storage.local.get([exchangeStorageKey]);
                        await inspect_status(completed[exchangeStorageKey]);
                        if (settled) {
                            return;
                        }
                    }
                }

                const afterCancellation = await chrome.storage.local.get([exchangeStorageKey]);
                const remainingEntry = afterCancellation[exchangeStorageKey];
                if (remainingEntry?.status === "complete") {
                    await inspect_status(remainingEntry);
                    if (settled) {
                        return;
                    }
                }
                if (
                    remainingEntry?.status === "waiting" &&
                    remainingEntry.nonce === entry?.nonce
                ) {
                    await chrome.storage.local.remove(exchangeStorageKey);
                }
            } catch (error) {
                console.warn("[CipherGap] Could not clean up timed-out exchange status:", error);
            }
            finish(
                reject,
                new Error(
                    `The key exchange timed out. Ask your partner to keep this ${get_current_messenger_label()} chat open, then try again.`
                )
            );
        }, timeoutMs);

        chrome.storage.local
            .get([exchangeStorageKey])
            .then((result) => inspect_status(result[exchangeStorageKey]))
            .catch((error) => finish(reject, error));
    });
}

async function handle_start_exchange(event) {
    const triggerButton = event?.currentTarget || exchangeBtn;

    if (!can_manage_chat()) {
        set_status(
            `Open a ${get_current_messenger_label()} chat before exchanging keys.`,
            "error"
        );
        return;
    }

    const keyBeforeConfirmation = currentSecretKey;
    if (currentSecretKey) {
        const shouldReplace = await show_confirmation({
            title: "Replace the current key?",
            message: "A new exchange will replace this chat's current encryption key. Older messages may require the previous key.",
            confirmLabel: "Start new exchange"
        });

        if (!shouldReplace) {
            return;
        }
    }

    if (
        currentSecretKey !== keyBeforeConfirmation ||
        ["waiting", "incoming"].includes(currentExchangeStatus?.status)
    ) {
        set_status("The key or exchange state changed while you were reviewing this action. Check it and try again.", "warning");
        return;
    }

    set_button_busy(triggerButton, true);
    externalAnnouncementSuppressionDepth += 1;
    set_status("Starting a secure key exchange…", "progress");
    dismissedSasNonce = null;
    expiredPendingNotice = false;

    try {
        const response = await send_tab_message({ action: "start_key_exchange" });
        if (!response?.ok) {
            throw new Error(response?.error || "The key exchange could not start.");
        }

        await refresh_popup_state();
        set_status("Request sent. Waiting for your partner to respond…", "progress");
        focus_active_view_heading();

        const result = await wait_for_exchange_complete(storageKey);
        await refresh_popup_state();
        mark_current_external_state_announced();

        if (result.fingerprintWarning) {
            set_status("The partner fingerprint changed. Compare the verification code before continuing.", "warning");
        } else if (result.sas) {
            set_status("Key exchanged. Compare the verification code with your partner.", "warning");
        } else {
            set_status("Key exchanged and saved. Exchange again if you need to verify your partner.", "warning");
        }
    } catch (error) {
        if (error?.name === "AbortError") {
            set_status("Pending key exchange cancelled.", "neutral");
        } else {
            console.error("[CipherGap] Exchange failed:", error);
            if (/timed out/i.test(get_error_message(error, ""))) {
                expiredPendingNotice = true;
            }
            set_status(get_error_message(error, "The key exchange failed."), "error");
        }
    } finally {
        set_button_busy(triggerButton, false);
        await refresh_popup_state().catch(() => render_popup());
        externalAnnouncementSuppressionDepth = Math.max(
            0,
            externalAnnouncementSuppressionDepth - 1
        );
    }
}

async function handle_cancel_exchange() {
    if (currentExchangeStatus?.status !== "waiting") {
        set_status("There is no pending outgoing exchange to cancel.", "neutral");
        return;
    }

    const nonce = currentExchangeStatus.nonce;
    intentionalExchangeRemovalNonces.add(nonce);
    setTimeout(
        () => intentionalExchangeRemovalNonces.delete(nonce),
        EXCHANGE_WAIT_TIMEOUT_MS + 5000
    );
    set_button_busy(cancelExchangeBtn, true);
    externalAnnouncementSuppressionDepth += 1;
    set_status("Cancelling the pending key exchange…", "progress");

    try {
        const response = await send_tab_message({
            action: "cancel_key_exchange",
            nonce
        });

        if (!response?.ok) {
            throw new Error(response?.error || "The pending exchange could not be cancelled.");
        }

        dismissedSasNonce = null;
        expiredPendingNotice = false;
        await refresh_popup_state();

        if (response.completed) {
            mark_current_external_state_announced();
            set_status("The exchange completed before cancellation. Compare the verification code before using the new key.", "warning");
        } else if (response.cancelled) {
            set_status("Pending key exchange cancelled.", "neutral");
        } else {
            throw new Error("The pending exchange could not be cancelled.");
        }
        focus_active_view_heading();
    } catch (error) {
        console.error("[CipherGap] Exchange cancellation failed:", error);
        set_status(get_error_message(error, "The pending exchange could not be cancelled."), "error");
    } finally {
        set_button_busy(cancelExchangeBtn, false);
        render_popup();
        externalAnnouncementSuppressionDepth = Math.max(
            0,
            externalAnnouncementSuppressionDepth - 1
        );
    }
}

async function handle_incoming_response(accept) {
    if (currentExchangeStatus?.status !== "incoming") {
        set_status("This exchange request is no longer available.", "warning");
        return;
    }

    const requestedNonce = currentExchangeStatus.nonce;
    if (accept && currentSecretKey) {
        const shouldReplace = await show_confirmation({
            title: "Accept and replace the current key?",
            message: "Accepting this request will replace this chat's encryption key. Confirm that you expect your partner to start a new exchange.",
            confirmLabel: "Accept and replace"
        });

        if (!shouldReplace) {
            return;
        }
    }

    if (
        currentExchangeStatus?.status !== "incoming" ||
        currentExchangeStatus.nonce !== requestedNonce
    ) {
        set_status("This exchange request changed while you were reviewing it. Check the current request and try again.", "warning");
        return;
    }

    const activeButton = accept ? acceptExchangeBtn : declineExchangeBtn;
    if (!accept) {
        intentionalExchangeRemovalNonces.add(requestedNonce);
        setTimeout(
            () => intentionalExchangeRemovalNonces.delete(requestedNonce),
            EXCHANGE_WAIT_TIMEOUT_MS + 5000
        );
    }
    set_button_busy(activeButton, true);
    externalAnnouncementSuppressionDepth += 1;
    render_action_availability();
    set_status(
        accept ? "Accepting the key exchange…" : "Declining the key exchange…",
        "progress"
    );

    try {
        const response = await send_tab_message({
            action: "respond_key_exchange",
            accept,
            nonce: requestedNonce
        });

        if (!response?.ok) {
            throw new Error(response?.error || "The exchange response could not be sent.");
        }

        dismissedSasNonce = null;
        expiredPendingNotice = false;
        await refresh_popup_state();

        if (accept) {
            mark_current_external_state_announced();
            set_status(
                response.fingerprintWarning
                    ? "Exchange complete, but the partner fingerprint changed. Compare the code carefully."
                    : "Exchange complete. Compare the verification code with your partner.",
                "warning"
            );
        } else {
            set_status("Key exchange request declined.", "neutral");
        }
        focus_active_view_heading();
    } catch (error) {
        console.error("[CipherGap] Incoming exchange response failed:", error);
        set_status(get_error_message(error, "The exchange response failed."), "error");
    } finally {
        set_button_busy(activeButton, false);
        render_popup();
        externalAnnouncementSuppressionDepth = Math.max(
            0,
            externalAnnouncementSuppressionDepth - 1
        );
    }
}

async function handle_sas_verified() {
    if (!has_current_eligible_sas()) {
        set_status("This verification code is no longer current. Review the latest chat security state.", "warning");
        return;
    }

    const nonce = currentExchangeStatus.nonce;
    set_button_busy(sasVerifiedBtn, true);
    render_action_availability();
    set_status("Saving partner verification…", "progress");

    try {
        const response = await send_tab_message({
            action: "mark_key_verified",
            nonce
        });
        if (!response?.ok) {
            throw new Error(response?.error || "Partner verification could not be saved.");
        }

        await refresh_popup_state();
        if (get_effective_trust_state() !== "verified") {
            throw new Error(
                `Verification was not saved. Reload ${get_current_messenger_label()} and try again.`
            );
        }

        try {
            const confirmationResponse = await send_tab_message({ action: "send_confirmation" });
            if (!confirmationResponse?.ok) {
                throw new Error(confirmationResponse?.error || "Confirmation was not sent.");
            }
            set_status("Partner verified. An encrypted confirmation was sent.", "success");
        } catch (confirmationError) {
            console.warn("[CipherGap] Verification saved, but confirmation failed:", confirmationError);
            set_status("Partner verified locally, but the confirmation message could not be sent.", "warning");
        }
        focus_active_view_heading();
    } catch (error) {
        console.error("[CipherGap] SAS verification failed:", error);
        set_status(get_error_message(error, "Partner verification could not be saved."), "error");
    } finally {
        set_button_busy(sasVerifiedBtn, false);
        render_popup();
    }
}

function handle_sas_dismiss() {
    if (!has_current_eligible_sas()) {
        return;
    }

    dismissedSasNonce = currentExchangeStatus.nonce;
    render_popup();
    set_status("Verification postponed. This key remains unverified.", "warning");
    focus_active_view_heading();
}

function handle_sas_resume() {
    if (!has_current_eligible_sas()) {
        set_status("The previous verification code is no longer available. Start another exchange.", "warning");
        return;
    }

    dismissedSasNonce = null;
    render_popup();
    set_status("Verification code ready for comparison.", "neutral");
    focus_active_view_heading();
}

function handle_stale_dismiss() {
    expiredPendingNotice = false;
    render_popup();
    set_status("Expired exchange dismissed.", "neutral");
    focus_active_view_heading();
}

async function load_auto_decrypt() {
    if (!can_manage_chat()) {
        autoDecryptToggle.checked = false;
        return;
    }

    try {
        const response = await send_tab_message({ action: "get_auto_decrypt" });
        autoDecryptToggle.checked = Boolean(response?.ok && response.enabled);
        const result = await chrome.storage.local.get(globalThis.CipherGapShared.storage_keys.auto_files(storageKey));
        autoFilesToggle.checked = Boolean(result[globalThis.CipherGapShared.storage_keys.auto_files(storageKey)]);
    } catch {
        autoDecryptToggle.checked = false;
    }
}

async function handle_auto_decrypt_change() {
    const enabled = autoDecryptToggle.checked;
    set_button_busy(autoDecryptToggle, true);

    try {
        const response = await send_tab_message({
            action: "set_auto_decrypt",
            enabled
        });
        if (!response?.ok) {
            throw new Error(response?.error || "The auto-decrypt setting could not be saved.");
        }

        if (enabled) {
            await send_tab_message({ action: "auto_decrypt_sweep" }).catch(() => {});
        }

        set_status(
            enabled
                ? "Auto-decrypt enabled for this chat."
                : "Auto-decrypt disabled for this chat.",
            enabled ? "success" : "neutral"
        );
    } catch (error) {
        console.error("[CipherGap] Auto-decrypt update failed:", error);
        autoDecryptToggle.checked = !enabled;
        set_status(get_error_message(error, "The auto-decrypt setting could not be saved."), "error");
    } finally {
        set_button_busy(autoDecryptToggle, false);
        render_action_availability();
    }
}

async function init() {
    render_manifest_version();
    clear_status();
    render_popup();

    try {
        const requestedTabId = new URL(location.href).searchParams.get("tabId");
        const [tab] = requestedTabId && /^\d+$/.test(requestedTabId)
            ? [await chrome.tabs.get(Number(requestedTabId))]
            : await chrome.tabs.query({ active: true, currentWindow: true });

        activeTabId = Number.isInteger(tab?.id) ? tab.id : null;

        if (!tab?.url) {
            throw new Error("The active browser page could not be read.");
        }

        let url;
        try {
            url = new URL(tab.url);
        } catch {
            throw new Error("The active browser page has an unsupported address.");
        }

        currentHostname = url.hostname || url.protocol.replace(":", "");
        const configuredMessenger = globalThis.CipherGapShared.messengers
            .get_by_hostname(currentHostname);

        if (!["http:", "https:"].includes(url.protocol) || !configuredMessenger) {
            currentMessenger = null;
            currentChatId = null;
            storageKey = null;
            popupContextState = "unsupported";
            render_popup();
            return;
        }

        currentMessenger = configuredMessenger.id;
        const context = await send_tab_message({ action: "get_chat_context" });
        if (!context?.ok || !context.supported) {
            throw new Error("CipherGap could not resolve this messenger context.");
        }

        currentMessenger = context.messenger || configuredMessenger.id;
        currentHostname = context.hostname || currentHostname;
        currentChatId = context.chatId || null;

        if (!context.inChat || !currentChatId) {
            storageKey = null;
            popupContextState = "no-chat";
            render_popup();
            return;
        }

        storageKey = context.storageKey;
        if (!storageKey) {
            throw new Error("CipherGap could not create a stable chat storage key.");
        }
        popupContextState = "ready";
        register_storage_listener();
        await refresh_popup_state({ announceStale: true });
        await load_auto_decrypt();
        render_popup();
    } catch (error) {
        console.error("[CipherGap] Popup initialization failed:", error);
        currentMessenger = currentMessenger ||
            globalThis.CipherGapShared.messengers
                .get_by_hostname(currentHostname)?.id ||
            null;
        currentChatId = null;
        storageKey = null;
        popupContextState = "error";
        initializationErrorMessage = get_error_message(
            error,
            "CipherGap could not inspect the active page."
        );
        render_popup();
        set_status(initializationErrorMessage, "error");
    }
}

manualKeyForm.addEventListener("submit", handle_manual_key_submit);
secretKeyInput.addEventListener("input", clear_manual_key_error);

revealKeyBtn.addEventListener("click", () => {
    isKeyRevealed = !isKeyRevealed;
    render_key_material();
});

copyKeyBtn.addEventListener("click", () => {
    copy_secret_key().catch((error) => {
        console.error("[CipherGap] Copy key failed:", error);
        set_status(get_error_message(error, "The key could not be copied."), "error");
    });
});

clearKeyBtn.addEventListener("click", handle_clear_key);
exchangeBtn.addEventListener("click", handle_start_exchange);
replaceKeyBtn.addEventListener("click", handle_start_exchange);
cancelExchangeBtn.addEventListener("click", handle_cancel_exchange);
acceptExchangeBtn.addEventListener("click", () => handle_incoming_response(true));
declineExchangeBtn.addEventListener("click", () => handle_incoming_response(false));
sasVerifiedBtn.addEventListener("click", handle_sas_verified);
sasMismatchBtn.addEventListener("click", handle_sas_mismatch);
sasDismissBtn.addEventListener("click", handle_sas_dismiss);
resumeSasBtn.addEventListener("click", handle_sas_resume);
staleDismissBtn.addEventListener("click", handle_stale_dismiss);
autoDecryptToggle.addEventListener("change", handle_auto_decrypt_change);
autoFilesToggle.addEventListener("change", async () => {
    const enabled = autoFilesToggle.checked;
    set_button_busy(autoFilesToggle, true);
    try {
        const response = await send_tab_message({ action: "set_auto_files", enabled });
        if (!response?.ok) throw new Error(response?.error || "Could not save file settings.");
        set_status(enabled ? "New incoming files will be decrypted and downloaded automatically." : "Automatic file downloads disabled.", "success");
    } catch (error) {
        autoFilesToggle.checked = !enabled;
        set_status(error.message, "error");
    } finally {
        set_button_busy(autoFilesToggle, false);
        render_action_availability();
    }
});
chooseFilesBtn.addEventListener("click", async () => {
    try {
        const response = await send_tab_message({ action: "choose_secure_files" });
        if (!response?.ok) throw new Error(response?.error || "Could not open the file picker.");
        window.close();
    } catch (error) { set_status(error.message, "error"); }
});
themeToggle.addEventListener("click", handle_theme_toggle);

initialize_theme();
init();
