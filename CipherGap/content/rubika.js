// Rubika exposes stable Angular directive attributes; no generated classes.
(function (shared) {
    const composer = () => document.querySelector('#column-center [rb-composer]');
    const anchor = () => composer()?.querySelector('[text-editor]');
    shared.chat_platforms.rubika = {
        name: "rubika", hostnames: shared.messengers.definitions.rubika.hostnames,
        supports_url: () => true,
        chat_id: url => /^#c=([A-Za-z0-9]+)(?:[&/?]|$)/.exec(url.hash)?.[1] ?? null,
        input_selector: '#column-center [rb-composer] [contenteditable="true"]',
        scroller_selector: '#column-center [rb-observer-container][data-chat-id]',
        message_selector: '#column-center [rb-message-item]',
        lifecycle_selector: '[rb-composer], [text-editor], input[type="file"]',
        toolbar_encrypt: true, dynamic_send_control: true,
        history_by_id: true,
        composer, toolbar_anchor: anchor,
        write_input(element, text) {
            shared.chat_ui.write_editor(element, text);
            // Rubika synchronizes its hidden draft on keyup, not input.
            // A non-Enter key avoids invoking its native send shortcut.
            element.dispatchEvent(new KeyboardEvent("keyup", {bubbles:true,key:"Unidentified",keyCode:0}));
        },
        // The native click handler belongs to the first ripple child. The
        // second ripple records audio; never activate it while draft UI settles.
        send_control() {
            const control = anchor()?.parentElement?.querySelector('[rb-tone-analizer]')?.parentElement?.querySelector('button > [ripple]');
            return control && !control.hidden ? control : null;
        },
        message_id: row => row.closest('[data-msg-id]')?.getAttribute('data-msg-id'),
        sent_at: () => 0,
        is_incoming: row => getComputedStyle(row.parentElement).flexDirection === "row",
        prepare_message(row) {
            row.querySelectorAll('[rb-message-time], [rb-message-reaction]').forEach(node => {node.dataset.ciphergapMetadata = "true";});
        },
        payload_root: row => row.querySelector('[rb-message-text]') ?? row,
        native_file_input: () => composer()?.querySelector('input[type="file"]:not([accept]), input[type="file"][accept=""]'),
        click_attachment(row, carrier, retry) {
            if (retry) return;
            // Rubika's document icon and filename share their native click row.
            let control = carrier;
            while (control?.parentElement && control.parentElement !== row && control.parentElement.children.length < 2) control = control.parentElement;
            if (!control || !row.contains(control)) throw new Error("Choose the downloaded .cgpe file to decrypt this attachment.");
            control.dispatchEvent(new MouseEvent("click", {bubbles:true,cancelable:true}));
        }
    };
})(globalThis.CipherGapShared);
