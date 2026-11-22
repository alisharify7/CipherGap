// background.js

chrome.runtime.onInstalled.addListener(() => {
    console.log("[CipherGap] Extension installed");
});

// App lock: the derived unlock key is kept only in session storage, which the
// browser clears on exit. Only this extension's own contexts can message us.
const VAULT_SESSION = "ciphergap_vault_session";

async function vault_session() {
    const stored = await chrome.storage.session.get(VAULT_SESSION);
    return stored[VAULT_SESSION] ?? null;
}

async function handle_vault(message) {
    const now = Date.now();
    const session = await vault_session();
    switch (message.action) {
        case "open": {
            const minutes = Number(message.minutes) || 0;
            if (typeof message.key !== "string" || message.key.length > 64) throw new Error("Invalid key.");
            const until = minutes > 0 ? now + minutes * 60000 : now + 365 * 24 * 3600000;
            await chrome.storage.session.set({ [VAULT_SESSION]: { key: message.key, until, minutes } });
            return { until };
        }
        case "key":
            if (!session || session.until <= now) {
                if (session) await chrome.storage.session.remove(VAULT_SESSION);
                return { key: null, until: 0 };
            }
            return { key: session.key, until: session.until };
        case "touch":
            if (!session || session.until <= now) return { until: 0 };
            if (session.minutes > 0) {
                session.until = now + session.minutes * 60000;
                await chrome.storage.session.set({ [VAULT_SESSION]: session });
            }
            return { until: session.until };
        case "minutes":
            if (session) {
                session.minutes = Number(message.minutes) || 0;
                session.until = session.minutes > 0 ? now + session.minutes * 60000 : now + 365 * 24 * 3600000;
                await chrome.storage.session.set({ [VAULT_SESSION]: session });
            }
            return {};
        case "lock":
            await chrome.storage.session.remove(VAULT_SESSION);
            return {};
        default:
            throw new Error("Unknown vault action.");
    }
}

// Lock automatically when the inactivity window passes, even with no page open.
chrome.alarms?.create("ciphergap-autolock", { periodInMinutes: 1 });
chrome.alarms?.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "ciphergap-autolock") return;
    const session = await vault_session();
    if (session && session.until <= Date.now()) {
        await chrome.storage.session.remove(VAULT_SESSION);
        await chrome.storage.local.set({ ciphergap_vault_state: { unlockedUntil: 0 } });
    }
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.ciphergapVault === true) {
        if (sender.id !== chrome.runtime.id) return false;
        handle_vault(message)
            .then((result) => respond({ ok: true, ...result }))
            .catch((error) => respond({ ok: false, error: error.message }));
        return true;
    }
    if (message.action !== "open_ciphergap" || !sender.tab) return false;
    (async () => {
        try {
            await chrome.action.openPopup({ windowId: sender.tab.windowId });
        } catch {
            await chrome.windows.create({
                url: chrome.runtime.getURL(`popup/popup.html?tabId=${sender.tab.id}`),
                type: "popup", width: 460, height: 650
            });
        }
        respond({ ok: true });
    })().catch((error) => respond({ ok: false, error: error.message }));
    return true;
});
