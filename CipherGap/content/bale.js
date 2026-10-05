// Bale's stable semantic DOM. Cryptography and UI live in chat_runtime.js.
(function (shared) {
    shared.chat_platforms ??= {};
    shared.chat_platforms.bale = {
        name: "bale", hostnames: shared.messengers.definitions.bale.hostnames,
        supports_url: () => true,
        chat_id: url => url.searchParams.get("uid"),
        input_selector: '#editable-message-text, #chat_footer textarea, #chat_footer [contenteditable="true"][role="textbox"]',
        scroller_selector: "#message_list_scroller_id",
        message_selector: '[data-sid][aria-label="message-item"]',
        send_selector: '[aria-label="send-button"]',
        toolbar_encrypt: true,
        composer: () => document.getElementById("chat_footer"),
        toolbar_anchor: () => document.querySelector('#chat_footer [aria-label="message-composer"]') ?? document.getElementById("chat_footer"),
        message_id: row => row.dataset.sid,
        sent_at: row => Number(row.dataset.date),
        is_incoming: row => Boolean(row.querySelector('[aria-label="LeftBubble-icon"]')),
        native_file_input: () => document.getElementById("chat_footer")?.querySelector('input[type="file"]'),
        click_attachment(row, carrier, retry) {
            const anchor = carrier?.closest("a, button");
            if (!anchor || !row.contains(anchor)) throw new Error("The attachment download control is unavailable. Choose the downloaded file instead.");
            const cached = Boolean(anchor.querySelector('img[alt="file"]'));
            if (!retry || cached) {
                const control = anchor.tagName === "A" ? (cached ? carrier : anchor.firstElementChild?.firstElementChild) : anchor;
                control?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            }
        }
    };
})(globalThis.CipherGapShared);
