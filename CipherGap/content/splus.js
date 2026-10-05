// Soroush Plus uses the same semantic editor/file controls as Telegram Web A.
(function (shared) {
    shared.chat_platforms.splus = {
        ...shared.chat_platforms.telegram,
        name: "splus", hostnames: shared.messengers.definitions.splus.hostnames,
        supports_url: () => true,
        message_selector: '[id^="message"][data-message-id]',
        defer_render_while_sending: true
    };
})(globalThis.CipherGapShared);
