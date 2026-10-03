// background.js

chrome.runtime.onInstalled.addListener(() => {
    console.log("[CipherGap] Extension installed");
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
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
