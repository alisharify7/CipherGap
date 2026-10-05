// Telegram Web A. Stable IDs/roles and native layout; no messenger CSS classes.
(function (shared) {
    shared.chat_platforms ??= {};
    const input = () => document.getElementById("editable-message-text");
    function file_control(carrier) {
        const semantic = carrier.closest('[data-document-id], [role="button"]');
        if (semantic) return semantic;
        const row = carrier.closest('[id^="message"][data-message-id]');
        // Native documents have an icon followed by filename/size metadata.
        // Stop at that structural pair instead of relying on File CSS classes.
        for (let node=carrier.parentElement;node && node!==row;node=node.parentElement) {
            if (node.children.length === 2 && !node.firstElementChild.contains(carrier) && node.lastElementChild.contains(carrier)) return node;
        }
        return carrier.parentElement?.parentElement;
    }
    shared.chat_platforms.telegram = {
        name: "telegram", hostnames: shared.messengers.definitions.telegram.hostnames,
        supports_url: url => url.pathname.startsWith("/a/"),
        chat_id: url => /^#(-?\d+)(?:[/?]|$)/.exec(url.hash)?.[1] ?? null,
        input_selector: "#editable-message-text",
        scroller_selector: "#MiddleColumn",
        message_selector: '[id^="message-"][data-message-id]',
        send_selector: '#MiddleColumn button[aria-label="Send Message"]',
        dynamic_send_control: true, toolbar_encrypt: true, history_by_id: true,
        composer: () => document.getElementById("message-input-text")?.parentElement?.parentElement,
        toolbar_anchor() {
            const inputRow = document.getElementById("message-input-text")?.parentElement;
            // New Web A includes Send inside the rounded composer surface.
            const surface = inputRow?.parentElement?.parentElement;
            return surface && !["transparent", "rgba(0, 0, 0, 0)"].includes(getComputedStyle(surface).backgroundColor) ? surface : inputRow;
        },
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
        file_action_anchor: file_control,
        async trigger_file_picker() {
            const button = document.getElementById("attach-menu-button");
            if (!button) throw new Error("Open a writable chat with file attachments available (English or Persian interface).");
            button.dispatchEvent(new MouseEvent("mousedown", {bubbles:true,cancelable:true,button:0}));
            button.dispatchEvent(new MouseEvent("mouseup", {bubbles:true,cancelable:true,button:0}));
            button.click();
            // Opening the menu can replace its children. Resolve the live item
            // after the native render instead of clicking a detached old node.
            for (let attempt = 0; attempt < 30; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 50));
                const menu = document.getElementById("attach-menu-controls");
                const item = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])]
                    .find(e => /^(File|فایل|پرونده|AttachDocument)$/iu.test(e.textContent.trim()) && e.getClientRects().length);
                if (item) {item.click();return;}
            }
            throw new Error("The file attachment menu is unavailable. Reopen the chat.");
        },
        click_attachment(row, carrier, retry) {
            const document = carrier?.closest('[data-document-id], [role="button"]');
            // File.tsx renders filename inside two wrappers; its outer File
            // container owns the native click handler and loading indicator.
            const control = file_control(carrier);
            if (!control || !row.contains(control)) throw new Error("Choose the downloaded .cgpe file to decrypt this attachment.");
            if (retry && control.querySelector('[role="progressbar"], [aria-busy="true"]')) return;
            if (!retry) (document ? control : control.firstElementChild)?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        }
    };
})(globalThis.CipherGapShared);
