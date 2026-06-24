// bale.js

const BALE_MESSAGE_SCROLLER = "#message_list_scroller_id";
const BALE_CHAT_INPUT = "#editable-message-text";
const BALE_SEND_BUTTON = '[aria-label="send-button"]';

// Flag: when true, sanitize_bale_input will skip stripping — prevents the
// sanitizer from eating exchange text while bale_send_message is using it.
let cg_sending = false;

function normalize_message_text(text) {
    return text
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\r\n]+/g, "")
        .trim();
}

async function bale_send_message(text) {
    const input = document.querySelector(BALE_CHAT_INPUT);
    if (!input) {
        throw new Error("Bale chat input not found.");
    }

    // Block the sanitizer while we fill the input and click send.
    cg_sending = true;

    input.textContent = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const sendButton = document.querySelector(BALE_SEND_BUTTON);
    if (!sendButton) {
        cg_sending = false;
        throw new Error("Bale send button not found.");
    }

    sendButton.click();

    // Clear the input after sending so exchange/SAS messages don't linger
    // in the field and risk being re-processed or re-sent.
    setTimeout(() => {
        input.textContent = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        cg_sending = false;
    }, 150);
}

// Clear the chat input field (used after exchange success / SAS verification).
function clear_bale_input() {
    const input = document.querySelector(BALE_CHAT_INPUT);
    if (!input) {
        return false;
    }

    input.textContent = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
}

// Guard: strip any exchange/SAS text that may have lingered in the input.
// Called on input changes so a stray "cg-sas|..." never gets sent again.
function sanitize_bale_input() {
    if (cg_sending) {
        return; // Skip — bale_send_message is actively using the input
    }

    const input = document.querySelector(BALE_CHAT_INPUT);
    if (!input) {
        return;
    }

    const text = normalize_message_text(input.textContent ?? "");
    if (is_exchange_message(text)) {
        input.textContent = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        console.warn("[CipherGap] Stripped lingering exchange text from chat input.");
    }
}

function extract_bale_message_text(messageElement) {
    for (const span of messageElement.querySelectorAll("span")) {
        const text = normalize_message_text(span.textContent ?? "");
        if (text) {
            return text;
        }
    }

    return normalize_message_text(messageElement.textContent ?? "");
}

// =========================
// Encrypt button
// =========================

function inject_encrypt_button_bale() {
    if (document.getElementById("ciphergap-btn")) {
        return;
    }

    const chatFooter = document.getElementById("chat_footer");
    if (!chatFooter) {
        return;
    }

    const footerContainer = chatFooter.querySelector("div");
    if (!footerContainer) {
        return;
    }

    const button = document.createElement("button");
    button.id = "ciphergap-btn";
    button.type = "button";
    button.innerText = "🔐";
    Object.assign(button.style, {
        width: "42px",
        height: "42px",
        border: "none",
        borderRadius: "50%",
        cursor: "pointer",
        marginLeft: "8px",
        fontSize: "18px",
        background: "#2563eb",
        color: "white"
    });

    button.addEventListener("click", async () => {
        try {
            button.disabled = true;

            const input = document.querySelector(BALE_CHAT_INPUT);
            if (!input) {
                return;
            }

            const plainText = input.textContent?.trim();
            if (!plainText) {
                return;
            }

            const secretKey = await get_secret_key();
            if (!secretKey) {
                alert(
                    "No encryption key set for this chat.\n\n" +
                    "Set a key manually in the CipherGap popup, or click " +
                    "\"Exchange Key\" to run Diffie-Hellman key exchange with the other user."
                );
                return;
            }

            const encryptedMessage = await encrypt_message(plainText, secretKey);
            const finalMessage = build_ciphergap_packet(encryptedMessage);

            input.textContent = finalMessage;
            input.dispatchEvent(new Event("input", { bubbles: true }));

            document.querySelector(BALE_SEND_BUTTON)?.click();
        } catch (error) {
            console.error("[CipherGap] Encrypt failed:", error);
            alert("Encryption failed. Check the console for details.");
        } finally {
            button.disabled = false;
        }
    });

    const insertBefore = footerContainer.children[4] ?? null;
    footerContainer.insertBefore(button, insertBefore);
}

// =========================
// Encrypted packet helpers
// =========================

function is_ciphergap_packet(text) {
    return Boolean(text?.trim().startsWith("CGP|"));
}

function find_cgp_span(messageElement) {
    for (const span of messageElement.querySelectorAll("span")) {
        const text = span.textContent ?? "";
        if (text.includes("CGP|")) {
            return span;
        }
    }
    return null;
}

function extract_cgp_packet_text(messageElement) {
    const span = find_cgp_span(messageElement);
    if (!span) {
        return "";
    }

    let text = normalize_message_text(span.textContent ?? "");

    if (text.includes("---")) {
        text = text.split("---")[0].trim();
    }

    return is_ciphergap_packet(text) ? text : "";
}

function replace_message_visual(messageElement, encryptedText, decryptedText) {
    const span = find_cgp_span(messageElement);
    if (!span) {
        return;
    }

    span.textContent = `${encryptedText}\n---\ndecrypted text: ${decryptedText}`;
}

function create_decrypt_button() {
    const button = document.createElement("button");
    button.type = "button";
    button.innerText = "Decrypt";
    Object.assign(button.style, {
        display: "block",
        marginTop: "6px",
        padding: "4px 8px",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "11px",
        background: "#16a34a",
        color: "white",
        position: "relative",
        zIndex: "10",
        pointerEvents: "auto"
    });
    return button;
}

function attach_decrypt_button(messageElement, decryptButton) {
    const cgpSpan = find_cgp_span(messageElement);
    const container = cgpSpan?.parentElement ?? messageElement;

    const wrapper = document.createElement("div");
    wrapper.className = "ciphergap-decrypt-wrap";
    wrapper.style.pointerEvents = "auto";
    wrapper.appendChild(decryptButton);
    container.appendChild(wrapper);
}

async function handle_decrypt_click(event, messageElement, decryptButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
        decryptButton.disabled = true;
        await decrypt_message_element(messageElement);
        decryptButton.remove();
    } catch (error) {
        console.error("[CipherGap] Decrypt failed:", error);
        alert("Decryption failed. Wrong key or corrupted message.");
    } finally {
        decryptButton.disabled = false;
    }
}

// Core decryption routine shared by manual click and auto-decrypt.
// Returns true on success, throws on failure.
async function decrypt_message_element(messageElement) {
    const currentText = extract_cgp_packet_text(messageElement);
    if (!is_ciphergap_packet(currentText)) {
        throw new Error("Could not read encrypted message from this bubble.");
    }

    const secretKey = await get_secret_key();
    if (!secretKey) {
        throw new Error("No encryption key set for this chat.");
    }

    const packet = parse_ciphergap_packet(currentText);
    if (!packet?.data) {
        throw new Error("Invalid CipherGap packet format.");
    }

    const decryptedText = await decrypt_message(packet.data, secretKey);
    replace_message_visual(messageElement, currentText, decryptedText);
    messageElement.dataset.ciphergapDecrypted = "true";
    return true;
}

function process_encrypted_bale_message(messageElement) {
    if (messageElement.dataset.ciphergapProcessed) {
        return;
    }

    const text = extract_cgp_packet_text(messageElement);
    if (!is_ciphergap_packet(text) || messageElement.dataset.ciphergapDecrypted === "true") {
        return;
    }

    messageElement.dataset.ciphergapProcessed = "true";

    // Try auto-decrypt first; fall back to manual Decrypt button if disabled or on failure
    get_auto_decrypt().then((autoDecrypt) => {
        if (autoDecrypt) {
            decrypt_message_element(messageElement).catch((err) => {
                console.warn("[CipherGap] Auto-decrypt failed, falling back to button:", err);
                attach_decrypt_button_to(messageElement);
            });
        } else {
            attach_decrypt_button_to(messageElement);
        }
    });
}

// Creates and attaches a manual Decrypt button to a message element.
function attach_decrypt_button_to(messageElement) {
    const decryptButton = create_decrypt_button();

    decryptButton.addEventListener(
        "click",
        (event) => handle_decrypt_click(event, messageElement, decryptButton),
        true
    );
    decryptButton.addEventListener(
        "mousedown",
        (event) => {
            event.stopPropagation();
            event.stopImmediatePropagation();
        },
        true
    );

    try {
        attach_decrypt_button(messageElement, decryptButton);
    } catch (error) {
        console.error("[CipherGap] Failed to attach decrypt button:", error);
    }
}

// When auto-decrypt is enabled, immediately decrypt all currently-visible
// encrypted messages that haven't been decrypted yet.
function auto_decrypt_visible_messages() {
    const scroller = document.querySelector(BALE_MESSAGE_SCROLLER);
    if (!scroller) {
        return;
    }

    scroller.querySelectorAll("[data-sid]").forEach((messageElement) => {
        if (messageElement.dataset.ciphergapDecrypted === "true") {
            return;
        }
        const text = extract_cgp_packet_text(messageElement);
        if (!is_ciphergap_packet(text)) {
            return;
        }
        decrypt_message_element(messageElement).catch((err) => {
            console.warn("[CipherGap] Auto-decrypt failed for a message:", err);
        });
    });
}

// =========================
// Hide exchange protocol messages
// =========================

function hide_exchange_protocol_message(messageElement, text) {
    // Visually minimize the raw exchange start/ack/SAS messages in chat.
    // They contain sensitive protocol data that users don't need to see raw.
    const normalized = text.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[\r\n]+/g, " ").trim();

    if (/^start exchange (key|ack):/i.test(normalized)) {
        messageElement.style.opacity = "0.3";
        messageElement.style.fontSize = "10px";
        messageElement.style.maxHeight = "20px";
        messageElement.style.overflow = "hidden";
        messageElement.style.pointerEvents = "none";
    }

    // SAS messages get a styled in-chat verification display
    if (/^cg-sas\|/.test(normalized)) {
        const parts = normalized.split("|");
        if (parts.length >= 2) {
            const sasCode = parts[1];
            const fingerprint = parts[2] ?? "";

            // Replace all spans with a clean SAS verification display
            const spans = messageElement.querySelectorAll("span");
            if (spans.length > 0) {
                spans.forEach((span) => {
                    span.textContent = "";
                });
                spans[0].innerHTML = `
                    <span style="display:block;font-size:11px;color:#94a3b8;">🔐 CipherGap SAS Verification</span>
                    <span style="display:block;font-size:22px;font-weight:700;letter-spacing:6px;color:#4ade80;margin:4px 0;">${sasCode}</span>
                    ${fingerprint ? `<span style="display:block;font-size:10px;color:#64748b;">Key fingerprint: ${fingerprint}</span>` : ""}
                `;
            }

            messageElement.style.borderLeft = "3px solid #4ade80";
            messageElement.style.paddingLeft = "10px";
        }
    }
}

function process_bale_message(messageElement) {
    if (!messageElement) {
        return;
    }

    const text = extract_bale_message_text(messageElement);
    if (!text) {
        return;
    }

    // Visually hide protocol messages
    if (is_exchange_message(text)) {
        hide_exchange_protocol_message(messageElement, text);
    }

    if (is_exchange_message(text) && !messageElement.dataset.ciphergapExchangeHandled) {
        messageElement.dataset.ciphergapExchangeHandled = "true";
        handle_incoming_exchange_message(text);
    }

    if (is_ciphergap_packet(text)) {
        process_encrypted_bale_message(messageElement);
    }
}

function scan_bale_messages() {
    const scroller = document.querySelector(BALE_MESSAGE_SCROLLER);
    if (!scroller) {
        return;
    }

    scroller.querySelectorAll("[data-sid]").forEach(process_bale_message);
}

function observe_bale_messages() {
    const interval = setInterval(() => {
        const scroller = document.querySelector(BALE_MESSAGE_SCROLLER);
        if (!scroller) {
            return;
        }

        clearInterval(interval);
        scan_bale_messages();

        // Attach input sanitizer so lingering exchange text can't be re-sent
        const chatInput = document.querySelector(BALE_CHAT_INPUT);
        if (chatInput && !chatInput.dataset.ciphergapSanitized) {
            chatInput.dataset.ciphergapSanitized = "true";
            chatInput.addEventListener("input", sanitize_bale_input);
            chatInput.addEventListener("focus", sanitize_bale_input);
        }

        // Clean up stale exchange status when entering a chat
        const storageKey = get_storage_key();
        cleanup_stale_exchange_status(storageKey).then(() => {
            console.log("[CipherGap] Stale exchange cleanup checked for", storageKey);
        }).catch(() => {});

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) {
                        return;
                    }

                    if (node.hasAttribute?.("data-sid")) {
                        process_bale_message(node);
                    }

                    node.querySelectorAll?.("[data-sid]").forEach(process_bale_message);
                });
            }
        });

        observer.observe(scroller, { childList: true, subtree: true });
        console.log("[CipherGap] Bale observer initialized");
    }, 1000);
}

const bale_adapter = {
    hostnames: ["web.bale.ai"],

    is_active() {
        return (
            window.location.hostname === "web.bale.ai" &&
            Boolean(document.querySelector(BALE_CHAT_INPUT))
        );
    },

    is_in_chat() {
        return Boolean(new URL(window.location.href).searchParams.get("uid"));
    },

    get_chat_storage_suffix(url) {
        return url.searchParams.get("uid");
    },

    send_message: bale_send_message,
    extract_message_text: extract_bale_message_text,
    inject_ui: inject_encrypt_button_bale,
    observe_messages: observe_bale_messages
};

register_messenger_adapter("bale", bale_adapter);
observe_bale_messages();

// Listen for auto-decrypt toggle from the popup so we can immediately
// decrypt all visible messages when the user enables the feature.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "auto_decrypt_sweep") {
        try {
            auto_decrypt_visible_messages();
            sendResponse({ ok: true });
        } catch (err) {
            sendResponse({ ok: false, error: err.message });
        }
        return false;
    }

    if (message.action === "clear_input") {
        // Clear any lingering exchange/SAS text from the chat input.
        try {
            const cleared = clear_bale_input();
            sendResponse({ ok: true, cleared });
        } catch (err) {
            sendResponse({ ok: false, error: err.message });
        }
        return false;
    }
});
