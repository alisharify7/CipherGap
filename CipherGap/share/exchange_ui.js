// Shared exchange cards. Adapters provide state, consent actions and mounting.
(function (shared) {
function create_chat_card_heading(title) {
    const heading = document.createElement("span");
    heading.className = "ciphergap-chat-card__heading";

    const mark = document.createElement("span");
    mark.className = "ciphergap-chat-card__mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "CG";

    const titleElement = document.createElement("span");
    titleElement.textContent = title;

    heading.append(mark, titleElement);
    return heading;
}

function create_exchange_chat_card(parsed, signature, options) {
    const isStart = parsed.type === "start";
    const card = document.createElement("span");
    card.className = "ciphergap-chat-card ciphergap-chat-card--exchange";
    card.dataset.ciphergapUi = "protocol";
    card.dataset.ciphergapProtocolKind = parsed.type;
    card.dataset.ciphergapProtocolSignature = signature;
    card.appendChild(create_chat_card_heading(
        isStart ? "Key exchange request" : "Key exchange response"
    ));

    const meta = document.createElement("span");
    meta.className = "ciphergap-chat-card__meta";
    meta.textContent = isStart
        ? "Open CipherGap to review this request."
        : "Open CipherGap to verify the code.";
    card.appendChild(meta);
    if (isStart) {
        const actions = document.createElement('span');
        actions.className = 'ciphergap-chat-card__actions';
        actions.hidden = true;
        for (const accept of [true, false]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ciphergap-action';
            button.dataset.ciphergapExchangeAction = accept ? 'accept' : 'decline';
            button.textContent = accept ? 'Accept request' : 'Decline';
            button.addEventListener('click', async event => {
                event.preventDefault(); event.stopPropagation();
                const storageKey = card.dataset.ciphergapStorageKey;
                if (storageKey !== options.readState().storageKey || !options.readState().enabled) return;
                if (accept && options.readState().hasKey && card.dataset.ciphergapReplaceConfirmed !== 'true') {
                    card.dataset.ciphergapReplaceConfirmed = 'true';
                    meta.textContent = 'Accepting replaces the current key. Older messages may need the previous key.';
                    button.textContent = 'Replace key and accept';
                    return;
                }
                actions.querySelectorAll('button').forEach(item => { item.disabled = true; });
                try {
                    await options.onRespond(accept, parsed.nonce);
                    card.dataset.ciphergapResponse = accept ? 'accepted' : 'declined';
                } catch (error) {
                    options.onError(error);
                } finally {
                    actions.querySelectorAll('button').forEach(item => { item.disabled = false; });
                    options.onUpdate();
                }
            });
            actions.append(button);
        }
        card.append(actions);
    }
    return card;
}

function update(cards, state) {
    const now = Date.now();
    for (const card of cards) {
        if (card.dataset.ciphergapStorageKey !== state.storageKey) continue;
        const expired = Number(card.dataset.ciphergapExpiresAt) <= now;
        const remaining = Math.max(0, Math.ceil((Number(card.dataset.ciphergapExpiresAt) - now) / 1000));
        const countdown = card.querySelector('.ciphergap-chat-card__timer');
        if (countdown) countdown.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
        card.classList.toggle('ciphergap-chat-card--expired', expired);
        const status = state.status;
        const current = status?.nonce === card.dataset.ciphergapNonce ||
            (card.dataset.ciphergapProtocolKind === 'sas' && status?.sas === card.dataset.ciphergapSas &&
             shared.protocol.get_exchange_expires_at(status) === Number(card.dataset.ciphergapExpiresAt));
        const actions = card.querySelector('.ciphergap-chat-card__actions');
        if (actions) actions.hidden = expired || !state.enabled || !current || status.status !== 'incoming' || Boolean(card.dataset.ciphergapResponse);
        const meta = card.querySelector('.ciphergap-chat-card__meta');
        let text;
        if (expired) text = 'Key exchange code expired. Request a new exchange.';
        else if (card.dataset.ciphergapResponse === 'declined') text = 'Key exchange request declined.';
        else if (current && status.status === 'complete') text = status.trustState === 'verified' ? 'Key verified.' : 'Key exchanged. Compare the six-digit code before verifying.';
        else if (current && status.status === 'incoming') text = card.dataset.ciphergapReplaceConfirmed === 'true'
            ? 'Accepting replaces the current key. Older messages may need the previous key.' : 'Accept only if you expected this key exchange.';
        else if (current && status.status === 'waiting') text = 'Waiting for your partner to accept.';
        else if (card.dataset.ciphergapProtocolKind === 'sas') text = 'Compare over a trusted call, then verify in CipherGap.';
        else text = 'This request is no longer available.';
        // Avoid observer churn on every tick and preserve translated text.
        if (meta && card.dataset.ciphergapMetaText !== text) { meta.textContent = text; card.dataset.ciphergapMetaText = text; }
    }
}


function create_sas_chat_card(parsed, signature) {
    const card = document.createElement("span");
    card.className = "ciphergap-chat-card ciphergap-chat-card--sas";
    card.dataset.ciphergapUi = "protocol";
    card.dataset.ciphergapProtocolKind = "sas";
    card.dataset.ciphergapSas = parsed.sas;
    card.dataset.ciphergapProtocolSignature = signature;
    card.setAttribute("role", "group");
    card.appendChild(create_chat_card_heading("Verification code"));

    const code = document.createElement("span");
    code.className = "ciphergap-chat-card__code";
    code.dir = "ltr";
    code.setAttribute(
        "aria-label",
        shared.protocol.speak_protocol_digits(parsed.sas)
    );
    code.textContent = shared.protocol.format_protocol_digits(parsed.sas);
    card.appendChild(code);

    const compareHint = document.createElement("span");
    compareHint.className = "ciphergap-chat-card__meta";
    compareHint.textContent = "Compare this code in CipherGap.";
    card.appendChild(compareHint);

    const fingerprint = document.createElement("span");
    fingerprint.className = "ciphergap-chat-card__meta";
    fingerprint.dir = "ltr";
    fingerprint.textContent =
        `Key fingerprint · ${shared.protocol.format_protocol_fingerprint(parsed.fingerprint)}`;
    card.appendChild(fingerprint);
    return card;
}


shared.exchange_ui = Object.freeze({ create_request: create_exchange_chat_card, create_code: create_sas_chat_card, update });
})(globalThis.CipherGapShared);
