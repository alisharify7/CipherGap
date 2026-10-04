// Telegram Web A. Stable IDs/roles and native layout; no messenger CSS classes.
(function (shared) {
    shared.chat_platforms ??= {};
    const input = () => document.getElementById("editable-message-text");
    shared.chat_platforms.telegram = {
        name: "telegram", hostnames: shared.messengers.definitions.telegram.hostnames,
        supports_url: url => url.pathname.startsWith("/a/"),
        chat_id: url => /^#(-?\d+)(?:[/?]|$)/.exec(url.hash)?.[1] ?? null,
        input_selector: "#editable-message-text",
        scroller_selector: "#MiddleColumn",
        message_selector: '[id^="message-"][data-message-id]',
        send_selector: '#MiddleColumn button[aria-label="Send Message"]',
        dynamic_send_control: true, toolbar_encrypt: true,
        composer: () => document.getElementById("message-input-text")?.parentElement?.parentElement,
        read_input: element => element.innerText,
        write_input(element, text) {
            // Let the editor's native input/DOM observers synchronize its state.
            element.textContent = text;
            element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: text ? "insertText" : "deleteContentBackward", data: text || null }));
        },
        send_control() {
            return document.querySelector('#MiddleColumn button[aria-label="Send Message"], #MiddleColumn button[aria-label="ارسال پیام"], #MiddleColumn button[aria-label="ارسال"]');
        },
        notice_previews(row) {
            return [...row.querySelectorAll('a[href]')].filter(link => {
                const allowed = shared.protocol.message_notice.split("\n").filter(value => value.startsWith("https://"));
                return allowed.includes(link.href) && !link.closest('[data-ciphergap-message-notice]') && link.parentElement.querySelector('p');
            }).map(link => link.parentElement.parentElement.parentElement).filter(node => node && row.contains(node));
        },
        message_id: row => row.dataset.messageId,
        sent_at: () => 0, // New CG exchanges carry their own absolute deadline.
        is_incoming: row => getComputedStyle(row).flexDirection === "row",
        trigger_file_picker() {
            const button = document.getElementById("attach-menu-button");
            const menu = document.getElementById("attach-menu-controls");
            const item = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])]
                .find(e => /^(File|فایل|پرونده)$/iu.test(e.textContent.trim()));
            if (!button || !item) throw new Error("Open a writable chat with file attachments available (English or Persian interface).");
            button.click();
            item.click();
        },
        click_attachment(row, carrier, retry) {
            const document = carrier?.closest('[data-document-id], [role="button"]');
            // File.tsx renders filename inside two wrappers; its outer File
            // container owns the native click handler and loading indicator.
            const control = document && row.contains(document) ? document : carrier?.parentElement?.parentElement;
            if (!control || !row.contains(control)) throw new Error("Choose the downloaded .cgpe file to decrypt this attachment.");
            if (retry && control.querySelector('[role="progressbar"], [aria-busy="true"]')) return;
            if (!retry) (document ? control : control.firstElementChild)?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        }
    };
})(globalThis.CipherGapShared);
