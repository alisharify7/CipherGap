// popup.js

const secretKeyInput = document.getElementById("secretKey");
const saveBtn = document.getElementById("saveBtn");
const exchangeBtn = document.getElementById("exchangeBtn");
const savedKeyEl = document.getElementById("savedKey");
const siteNameEl = document.getElementById("siteName");
const statusEl = document.getElementById("status");
const savedState = document.getElementById("savedState");
const messengerCards = document.querySelectorAll(".messenger-card");

// SAS verification panel
const sasPanel = document.getElementById("sasPanel");
const sasCode = document.getElementById("sasCode");
const sasFingerprint = document.getElementById("sasFingerprint");
const sasWarning = document.getElementById("sasWarning");
const sasVerifiedBtn = document.getElementById("sasVerifiedBtn");
const sasDismissBtn = document.getElementById("sasDismissBtn");

// Stale exchange warning
const staleWarning = document.getElementById("staleWarning");
const staleDismissBtn = document.getElementById("staleDismissBtn");

// Clear key + auto-decrypt
const clearKeyBtn = document.getElementById("clearKeyBtn");
const autoDecryptToggle = document.getElementById("autoDecryptToggle");

const supportedHosts = [
    "web.rubika.ir",
    "web.splus.ir",
    "web.bale.ai",
    "web.eitaa.com"
];

let currentHostname = null;
let currentChatId = null;
let storageKey = null;
let activeTabId = null;

async function init() {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    activeTabId = tab.id;
    const url = new URL(tab.url);

    currentHostname = url.hostname;
    currentChatId = url.searchParams.get("uid");

    storageKey = currentChatId
        ? `${currentHostname}_${currentChatId}`
        : currentHostname;

    validate_supported_host();
    update_current_chat_ui();
    update_messenger_tabs();
    await check_stale_exchange();
    await load_saved_key();
    await load_auto_decrypt();
}

function update_current_chat_ui() {
    siteNameEl.innerText = currentChatId
        ? `${currentHostname} • Chat ${currentChatId}`
        : currentHostname;
}

function update_messenger_tabs() {
    messengerCards.forEach((card) => {
        const messengerName = card
            .querySelector(".messenger-name")
            ?.innerText
            .toLowerCase();

        card.classList.remove("active");

        if (currentHostname.includes("bale") && messengerName === "bale") {
            card.classList.add("active");
        }
        if (currentHostname.includes("rubika") && messengerName === "rubika") {
            card.classList.add("active");
        }
        if (currentHostname.includes("eitaa") && messengerName === "eitaa") {
            card.classList.add("active");
        }
        if (currentHostname.includes("splus") && messengerName === "splus") {
            card.classList.add("active");
        }
    });
}

function validate_supported_host() {
    if (!supportedHosts.includes(currentHostname)) {
        statusEl.innerText = "❌ Unsupported website";
        saveBtn.disabled = true;
        exchangeBtn.disabled = true;
        secretKeyInput.disabled = true;
        saveBtn.style.opacity = ".5";
        exchangeBtn.style.opacity = ".5";
        return false;
    }

    if (!currentChatId) {
        exchangeBtn.disabled = true;
        exchangeBtn.style.opacity = ".5";
    }

    return true;
}

// =========================
// Stale exchange detection
// =========================

async function check_stale_exchange() {
    if (!currentChatId) {
        return;
    }

    const statusKey = `exchange_status_${storageKey}`;
    const result = await chrome.storage.local.get([statusKey]);
    const entry = result[statusKey];

    if (!entry) {
        return;
    }

    const age = Date.now() - entry.at;
    const EXCHANGE_STATUS_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes — must match storage.js

    // Still "waiting" and expired — show warning and clean up
    if (entry.status === "waiting" && age > EXCHANGE_STATUS_EXPIRY_MS) {
        await chrome.storage.local.remove(statusKey);
        show_stale_warning();
        return;
    }

    // "complete" but old — clean up silently, show SAS if available
    if (entry.status === "complete" && age > EXCHANGE_STATUS_EXPIRY_MS) {
        // Keep the key but remove the exchange status
        await chrome.storage.local.remove(statusKey);
        return;
    }

    // Exchange is "complete" and still fresh — show SAS verification panel
    if (entry.status === "complete" && entry.sas) {
        show_sas_panel(entry.sas, entry.fingerprint, entry.fingerprintWarning);
    }
}

function show_stale_warning() {
    staleWarning.style.display = "block";
}

staleDismissBtn.addEventListener("click", () => {
    staleWarning.style.display = "none";
});

// =========================
// SAS verification panel
// =========================

function show_sas_panel(sas, fingerprint, fingerprintWarning) {
    sasCode.textContent = sas;
    sasFingerprint.textContent = fingerprint
        ? `Fingerprint: ${fingerprint}`
        : "";
    sasPanel.style.display = "block";

    if (fingerprintWarning) {
        sasWarning.style.display = "block";
    } else {
        sasWarning.style.display = "none";
    }
}

function hide_sas_panel() {
    sasPanel.style.display = "none";
}

sasVerifiedBtn.addEventListener("click", async () => {
    hide_sas_panel();
    statusEl.innerText = "⏳ Confirming key exchange…";
    statusEl.style.color = "#fbbf24";

    try {
        // Send an encrypted confirmation message so the peer sees that this
        // side has verified the SAS code and trusts the exchanged key.
        const response = await chrome.tabs.sendMessage(activeTabId, { action: "send_confirmation" });
        if (!response?.ok) {
            throw new Error(response?.error ?? "Failed to send confirmation.");
        }

        statusEl.innerText = "✅ Key verified — confirmation sent";
        statusEl.style.color = "#4ade80";
    } catch (error) {
        console.error("[CipherGap] Confirmation failed:", error);
        statusEl.innerText = `✅ Key verified locally — confirmation failed: ${error.message}`;
        statusEl.style.color = "#fbbf24";
    }
});

sasDismissBtn.addEventListener("click", () => {
    hide_sas_panel();
});

// =========================
// Load saved key
// =========================

async function load_saved_key() {
    const result = await chrome.storage.local.get([storageKey]);
    const savedKey = result[storageKey];

    if (savedKey) {
        savedState.style.display = "block";
        savedKeyEl.innerText = savedKey;
        secretKeyInput.value = savedKey;
        statusEl.innerText = "🔐 Encryption active";
        statusEl.style.color = "#4ade80";
    } else {
        savedState.style.display = "none";
        statusEl.innerText = "⚠️ No key configured";
        statusEl.style.color = "#fbbf24";
    }
}

// =========================
// Save key
// =========================

saveBtn.addEventListener("click", async () => {
    if (!validate_supported_host()) {
        return;
    }

    const key = secretKeyInput.value.trim();
    if (!key) {
        statusEl.innerText = "❌ Please enter a key";
        statusEl.style.color = "#f87171";
        return;
    }

    await chrome.storage.local.set({ [storageKey]: key });

    savedKeyEl.innerText = key;
    savedState.style.display = "block";
    statusEl.innerText = "✅ Key saved successfully";
    statusEl.style.color = "#4ade80";
});

// =========================
// Clear key
// =========================

clearKeyBtn.addEventListener("click", async () => {
    const confirmClear = confirm(
        "Clear the encryption key for this chat?\n\n" +
        "You will not be able to read or send encrypted messages until you set a new key or run a new exchange."
    );
    if (!confirmClear) {
        return;
    }

    try {
        const response = await chrome.tabs.sendMessage(activeTabId, { action: "clear_key" });
        if (!response?.ok) {
            throw new Error(response?.error ?? "Failed to clear key.");
        }

        savedState.style.display = "none";
        secretKeyInput.value = "";
        hide_sas_panel();
        staleWarning.style.display = "none";

        statusEl.innerText = "🗑 Key cleared for this chat";
        statusEl.style.color = "#fbbf24";
    } catch (error) {
        console.error("[CipherGap] Clear key failed:", error);
        statusEl.innerText = `❌ ${error.message}`;
        statusEl.style.color = "#f87171";
    }
});

// =========================
// Auto-decrypt
// =========================

async function load_auto_decrypt() {
    try {
        const response = await chrome.tabs.sendMessage(activeTabId, { action: "get_auto_decrypt" });
        if (response?.ok) {
            autoDecryptToggle.checked = Boolean(response.enabled);
        }
    } catch (error) {
        // Content script may not be ready yet; default to off
        autoDecryptToggle.checked = false;
    }
}

autoDecryptToggle.addEventListener("change", async () => {
    const enabled = autoDecryptToggle.checked;

    try {
        const response = await chrome.tabs.sendMessage(activeTabId, {
            action: "set_auto_decrypt",
            enabled
        });
        if (!response?.ok) {
            throw new Error(response?.error ?? "Failed to save auto-decrypt setting.");
        }

        // If just enabled, sweep all currently-visible messages
        if (enabled) {
            await chrome.tabs.sendMessage(activeTabId, { action: "auto_decrypt_sweep" }).catch(() => {});
        }

        statusEl.innerText = enabled
            ? "🔓 Auto-decrypt enabled for this chat"
            : "🔒 Auto-decrypt disabled";
        statusEl.style.color = enabled ? "#4ade80" : "#94a3b8";
    } catch (error) {
        console.error("[CipherGap] Auto-decrypt toggle failed:", error);
        // Revert toggle on failure
        autoDecryptToggle.checked = !enabled;
        statusEl.innerText = `❌ ${error.message}`;
        statusEl.style.color = "#f87171";
    }
});

// =========================
// Exchange key (DH)
// =========================

exchangeBtn.addEventListener("click", async () => {
    if (!validate_supported_host()) {
        return;
    }

    if (!currentChatId) {
        statusEl.innerText = "❌ Open a chat before exchanging keys";
        statusEl.style.color = "#f87171";
        return;
    }

    const existing = await chrome.storage.local.get([storageKey]);
    if (existing[storageKey]) {
        const replace = confirm(
            "This chat already has an encryption key.\nReplace it with a new exchanged key?"
        );
        if (!replace) {
            return;
        }
    }

    exchangeBtn.disabled = true;
    statusEl.innerText = "⏳ Starting key exchange…";
    statusEl.style.color = "#fbbf24";

    try {
        const response = await chrome.tabs.sendMessage(activeTabId, {
            action: "start_key_exchange"
        });

        if (!response?.ok) {
            throw new Error(response?.error ?? "Key exchange failed.");
        }

        statusEl.innerText = "⏳ Waiting for partner to acknowledge…";

        const result = await wait_for_exchange_complete(storageKey);

        savedKeyEl.innerText = result.key;
        secretKeyInput.value = result.key;
        savedState.style.display = "block";

        if (result.sas) {
            show_sas_panel(result.sas, result.fingerprint, result.fingerprintWarning);
            statusEl.innerText = "✅ Key exchanged — verify the SAS code with your partner";
            statusEl.style.color = "#fbbf24";
        } else {
            statusEl.innerText = "✅ Key exchanged and saved for this chat";
            statusEl.style.color = "#4ade80";
        }
    } catch (error) {
        console.error("[CipherGap] Exchange failed:", error);
        statusEl.innerText = `❌ ${error.message}`;
        statusEl.style.color = "#f87171";
    } finally {
        exchangeBtn.disabled = !currentChatId;
    }
});

function wait_for_exchange_complete(key, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        const statusKey = `exchange_status_${key}`;
        const startedAt = Date.now();

        const interval = setInterval(async () => {
            const result = await chrome.storage.local.get([key, statusKey]);
            const exchangeStatus = result[statusKey];

            if (result[key] && exchangeStatus?.status === "complete") {
                clearInterval(interval);
                resolve({
                    key: result[key],
                    sas: exchangeStatus.sas ?? null,
                    fingerprint: exchangeStatus.fingerprint ?? null,
                    fingerprintWarning: exchangeStatus.fingerprintWarning ?? false
                });
                return;
            }

            if (Date.now() - startedAt > timeoutMs) {
                clearInterval(interval);
                // Clean up the stale waiting status
                chrome.storage.local.remove(statusKey).catch(() => {});
                reject(new Error("Key exchange timed out. Ask your partner to open the chat with CipherGap active."));
            }
        }, 500);
    });
}

init();
