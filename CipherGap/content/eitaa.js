// Eitaa Web's semantic message attributes and structural composer.
(function (shared) {
    shared.chat_platforms ??= {};
    function input() {
        return [...document.querySelectorAll('#column-center [contenteditable="true"][enterkeyhint]')]
            .find(e => e.getClientRects().length && e.getAttribute("aria-disabled") !== "true") ?? null;
    }
    function native_row() {
        let node = input();
        while (node && node.id !== "column-center") {
            // The file input is mounted asynchronously after the composer.
            // Locate the stable attachment icon so first-load UI also works.
            if (node.querySelector('[data-icon="attach"]')) return node;
            node = node.parentElement;
        }
        return null;
    }
    function composer() { return native_row()?.parentElement?.parentElement?.parentElement; }
    shared.chat_platforms.eitaa = {
        name: "eitaa", hostnames: shared.messengers.definitions.eitaa.hostnames,
        supports_url: () => true,
        chat_id: url => /^#(-?\d+)(?:[/?]|$)/.exec(url.hash)?.[1] ?? null,
        input_selector: '#column-center [contenteditable="true"][enterkeyhint]',
        scroller_selector: "#column-center",
        message_selector: 'div[data-mid][data-peer-id][data-timestamp]',
        send_selector: '[data-ciphergap-composer="true"] > div:last-child button',
        toolbar_encrypt: true,
        composer,
        send_control: () => composer()?.querySelector('[data-icon="send"]')?.closest("button"),
        message_id: row => row.dataset.mid,
        sent_at: row => Number(row.dataset.timestamp) * 1000,
        is_incoming(row) {
            // Outgoing bubbles are aligned to the end by native layout.
            const style = getComputedStyle(row);
            return style.justifyContent === "flex-start" || style.flexDirection === "row" && style.justifyContent !== "flex-end";
        },
        prepare_message(row) {
            // Eitaa's native time wrapper has a dated tooltip and no stable ID.
            // Keep it outside protocol text while preserving its presentation.
            for (const element of row.querySelectorAll("span > div[title]")) {
                if (Number.isFinite(Date.parse(element.title.split("\n")[0]))) element.parentElement.dataset.ciphergapMetadata = "true";
            }
        },
        async trigger_file_picker() {
            const menu = native_row()?.querySelector('[data-icon="attach"]')?.parentElement;
            if (!menu) throw new Error("The file attachment menu is unavailable. Reopen the chat.");
            menu.click();
            // The menu is lazily rendered after its permissions query resolves.
            for (let attempt = 0; attempt < 30; attempt++) {
                const icon = menu.querySelector('[data-icon="document"]');
                if (icon) {
                    icon.parentElement.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw new Error("The document attachment option is unavailable in this conversation.");
        },
        document_id: row => row.querySelector('[data-doc-id]')?.dataset.docId,
        async read_cached_file(row, limit) {
            const id = row.querySelector('[data-doc-id]')?.dataset.docId;
            if (!/^\d+$/.test(id ?? "") || !globalThis.caches) return null;
            const response = await (await caches.open("cachedFiles")).match(`/document_${id}`);
            if (!response) return null;
            const blob = await response.blob();
            if (blob.size > limit) throw new Error("The encrypted file exceeds the safety limit.");
            // An app-level passcode can encrypt its cache again. Let the native
            // download path handle such entries instead of reading private state.
            if (new TextDecoder().decode(await blob.slice(0, 4).arrayBuffer()) !== "CGPE") return null;
            return blob.arrayBuffer();
        },
        click_attachment(row, carrier, retry) {
            const control = carrier?.closest('[data-doc-id]');
            if (!control || !row.contains(control)) throw new Error("Choose the downloaded .cgpe file to decrypt this attachment.");
            if (!retry) control.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        }
    };
})(globalThis.CipherGapShared);
