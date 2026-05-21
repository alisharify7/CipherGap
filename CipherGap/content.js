// content.js

console.log(`CipherGap version ${get_manifest_info().version} Loaded succesfully ...`);

/**
 * Observe DOM changes
 * for dynamic SPA rendering
 */
function start_dom_observer() {

    const observer =
        new MutationObserver(
            () => {
                messenger_detection();
            }
        );

    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );

    console.log(
        "CipherGap DOM observer started"
    );
}

window.addEventListener(
    "load",
    () => {
        messenger_detection();
        start_dom_observer();
    }
);
window.addEventListener("focus", () => {
    messenger_detection();
});


/**
 * Build unique storage key
 * for current messenger chat
 */
function get_storage_key() {

    const url =
        new URL(window.location.href);

    const hostname =
        url.hostname;

    /**
     * Bale chat uid
     */
    if (hostname === "web.bale.ai") {

        const uid =
            url.searchParams.get("uid");

        if (uid) {
            return `${hostname}_${uid}`;
        }
    }

    /**
     * Fallback
     */
    return hostname;
}



/**
 * Detect supported messenger web applications
 * and determine whether the user is currently
 * inside an active chat page.
 *
 * Current implementation status:
 *
 * - Bale   : Implemented
 * - Eitaa  : Pending refinement
 * - Rubika : Pending refinement
 * - Splus  : Pending refinement
 *
 * Return structure:
 *
 * {
 *   detected: boolean,
 *   messenger: string | null,
 *   input: HTMLElement | null
 * }
 *
 * Example:
 *
 * {
 *   detected: true,
 *   messenger: "bale",
 *   input: HTMLDivElement
 * }
 */
function messenger_detection() {

    /**
     * Current website hostname
     */
    const hostname =
        window.location.hostname;

    console.log(
        "Detecting messenger:",
        hostname
    );


    // =====================================================
    // Bale Web
    // =====================================================

    /**
     * Bale detection strategy:
     *
     * - Validate hostname
     * - Validate message input existence
     *
     * Stable semantic selectors are preferred
     * over auto-generated React class names.
     */
    if (hostname.startsWith("web.bale.ai")) {

        /**
         * Bale message input
         */
        const baleChatInput =
            document.querySelector(
                '#editable-message-text'
            );

        /**
         * User is currently inside
         * an active Bale chat
         */
        if (baleChatInput) {

            console.log(
                "Bale chat mode detected"
            );


            /**
             * Inject CipherGap UI
             */
            inject_encrypt_button_bale();
            // check_encrypt_message_exists_in_bale();


            return {
                detected: true,
                messenger: "bale",
                input: baleChatInput
            };
        }


        /**
         * Bale detected but
         * no active chat found
         */
        return {
            detected: false,
            messenger: "bale"
        };
    }


    // =====================================================
    // Eitaa Web
    // =====================================================

    /**
     * TODO:
     * Improve Eitaa-specific detection logic
     */
    if (hostname === "web.eitaa.com") {

        const eitaaInput =
            document.querySelector(
                'textarea, [contenteditable="true"]'
            );

        if (eitaaInput) {

            console.log(
                "Eitaa chat detected"
            );

            return {
                detected: true,
                messenger: "eitaa",
                input: eitaaInput
            };
        }

        return {
            detected: false,
            messenger: "eitaa"
        };
    }


    // =====================================================
    // Rubika Web
    // =====================================================

    /**
     * TODO:
     * Improve Rubika-specific detection logic
     */
    if (hostname === "web.rubika.ir") {

        const rubikaInput =
            document.querySelector(
                'textarea, [contenteditable="true"]'
            );

        if (rubikaInput) {

            console.log(
                "Rubika chat detected"
            );

            return {
                detected: true,
                messenger: "rubika",
                input: rubikaInput
            };
        }

        return {
            detected: false,
            messenger: "rubika"
        };
    }


    // =====================================================
    // Splus Web
    // =====================================================

    /**
     * TODO:
     * Improve Splus-specific detection logic
     */
    if (hostname === "web.splus.ir") {

        const splusInput =
            document.querySelector(
                'textarea, [contenteditable="true"]'
            );

        if (splusInput) {

            console.log(
                "Splus chat detected"
            );

            return {
                detected: true,
                messenger: "splus",
                input: splusInput
            };
        }

        return {
            detected: false,
            messenger: "splus"
        };
    }


    // =====================================================
    // Unsupported Website
    // =====================================================

    return {
        detected: false,
        messenger: null
    };
}




/**
 * Inject CipherGap button into Bale chat footer
 */
function inject_encrypt_button_bale() {

    /**
     * Prevent duplicate injection
     */
    if (
        document.getElementById(
            "ciphergap-btn"
        )
    ) {
        return;
    }


    /**
     * Get Bale chat footer
     */
    const chatFooter =
        document.getElementById(
            "chat_footer"
        );

    if (!chatFooter) {

        console.log(
            "CipherGap: chat footer not found"
        );

        return;
    }


    /**
     * Get footer container
     */
    const footerContainer =
        chatFooter.querySelector(
            "div"
        );

    if (!footerContainer) {

        console.log(
            "CipherGap: footer container not found"
        );

        return;
    }



    /**
     * Create CipherGap button
     */
    const button =
        document.createElement(
            "button"
        );

    button.id =
        "ciphergap-btn";

    button.innerText =
        "🔐";

    button.title =
        "Send Encrypted Message";

    button.type =
        "button";


    /**
     * Button styles
     */
    Object.assign(
        button.style,
        {
            width: "42px",
            height: "42px",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            marginLeft: "8px",
            fontSize: "18px",
            background: "#2563eb",
            color: "white",
            flexShrink: "0"
        }
    );


    /**
     * Encrypt and send message
     */
    button.addEventListener(
        "click",
        async () => {

            try {

                /**
                 * Prevent double click
                 */
                button.disabled =
                    true;


                /**
                 * Get message input
                 */
                const input =
                    document.querySelector(
                        "#editable-message-text"
                    );

                if (!input) {

                    console.log(
                        "CipherGap: message input not found"
                    );

                    return;
                }


                /**
                 * Get plain text
                 */
                const plainText =
                    input.textContent?.trim();
                
                
                if (!plainText) {

                    console.log(
                        "CipherGap: empty message"
                    );

                    return;
                }


                /**
                 * Read encryption key
                 * from extension storage
                 */

                const storageKey =
                    get_storage_key();

                console.log(
                    "CipherGap storage key:",
                    storageKey
                );

                const storage =
                    await chrome.storage.local.get(
                        [storageKey]
                    );

                const secretKey =
                    storage[storageKey];
                
                if (!secretKey) {

                    alert(
                        "No encryption key configured for this current chat, please open Extension and set a key."
                    );

                    return;
                }


                console.log(
                    "CipherGap: encrypting message"
                );


                /**
                 * Encrypt message
                 */
                const encryptedMessage =
                    await encrypt_message(
                        plainText,
                        secretKey
                    );


                /**
                 * Build CipherGap packet
                 */
                const finalMessage =
                    build_ciphergap_packet(
                        encryptedMessage
                    );


                /**
                 * Replace input text
                 */
                input.textContent =
                    finalMessage;


                /**
                 * Trigger framework update
                 * for React/Vue/etc.
                 */
                input.dispatchEvent(
                    new Event(
                        "input",
                        {
                            bubbles: true
                        }
                    )
                );


                /**
                 * Find native send button and click it 
                 */
                const sendButton =
                    document.querySelector(
                        '[aria-label="send-button"]'
                    );

                if (!sendButton) {

                    console.log(
                        "CipherGap: send button not found"
                    );

                    return;
                }


                /**
                 * Trigger native send
                 */
                sendButton.click();

                console.log(
                    "CipherGap: encrypted message sent"
                );

            } catch (error) {

                console.error(
                    "CipherGap error:",
                    error
                );

            } finally {

                /**
                 * Re-enable button
                 */
                button.disabled =
                    false;
            }
        }
    );


    /**
     * Insert CipherGap button
     * next to attachment button
     */
    footerContainer.insertBefore(button, footerContainer.children[4]);


    console.log(
        "CipherGap button injected"
    );
}

/**
 * Encrypt message using AES-GCM
 */
async function encrypt_message(message, password) {

    /**
     * Convert password to crypto key
     */
    const encoder =
        new TextEncoder();

    const passwordBytes =
        encoder.encode(password);

    const passwordHash =
        await crypto.subtle.digest(
            "SHA-256",
            passwordBytes
        );

    const cryptoKey =
        await crypto.subtle.importKey(
            "raw",
            passwordHash,
            {
                name: "AES-GCM"
            },
            false,
            ["encrypt"]
        );


    /**
     * Generate IV
     */
    const iv =
        crypto.getRandomValues(
            new Uint8Array(12)
        );


    /**
     * Encrypt message
     */
    const encryptedBuffer =
        await crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            cryptoKey,
            encoder.encode(message)
        );


    /**
     * Convert encrypted data to base64
     */
    const encryptedArray =
        new Uint8Array(
            encryptedBuffer
        );

    const combined =
        new Uint8Array(
            iv.length +
            encryptedArray.length
        );

    combined.set(iv);
    combined.set(
        encryptedArray,
        iv.length
    );


    return btoa(
        String.fromCharCode(
            ...combined
        )
    );
}


/**
 * Build CipherGap message packet
 *
 * Output format:
 * CGP|1|AESGCM|timestamp|payload
 *   CGP        -> protocol magic
 *   1          -> protocol version
 *   AESGCM     -> algorithm
 *   1747420000 -> unix timestamp
 *   BASE64     -> encrypted payload
 */
function build_ciphergap_packet(
    encryptedPayload
) {

    const manifest = get_manifest_info();

    const protocol =
        "CGP";

    const version =
        "1";

    const algorithm =
        "AESGCM";

    const timestamp =
        Math.floor(
            Date.now() / 1000
        );


    return [
        protocol,
        version,
        algorithm,
        timestamp,
        encryptedPayload
    ].join("|");
}


function get_manifest_info(){
    return chrome.runtime.getManifest();
}
/**
 * Global delegated click handler
 */
document.addEventListener(
    "click",
    async (event) => {

        /**
         * Find decrypt button
         */
        const button =
            event.target.closest(
                ".ciphergap-decrypt-btn"
            );

        if (!button) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        console.log(
            "CipherGap decrypt clicked"
        );

        try {

            /**
             * Read packet directly
             * from button dataset
             */
            const packet =
                button.dataset.packet;

            console.log(
                "Packet:",
                packet
            );

            if (!packet) {
                return;
            }


            /**
             * Parse packet
             */
            const parsed =
                parse_ciphergap_packet(
                    packet
                );

            console.log(
                "Parsed:",
                parsed
            );

            if (!parsed) {
                return;
            }


            /**
             * Load secret key
             */


            const storageKey =
                get_storage_key();

            console.log(
                "CipherGap storage key:",
                storageKey
            );

            const storage =
                await chrome.storage.local.get(
                    [storageKey]
                );

            const secretKey =
                storage[storageKey];
            console.log(secretKey);
            

            if (!secretKey) {

                alert(
                    "Encryption key not found"
                );

                return;
            }


            /**
             * Decrypt payload
             */
            const decrypted =
                await decrypt_message(
                    parsed.payload,
                    secretKey
                );

            console.log(
                "Decrypted:",
                decrypted
            );


            /**
             * Prevent duplicate render
             */
            if (
                button.dataset.decrypted
            ) {
                return;
            }

            button.dataset.decrypted =
                "true";


            /**
             * Create decrypted block
             */
            const block =
                document.createElement(
                    "div"
                );

            block.innerText =
                `---\n${decrypted}`;


            Object.assign(
                block.style,
                {
                    marginTop: "6px",
                    whiteSpace:
                        "pre-wrap",
                    wordBreak:
                        "break-word"
                }
            );


            /**
             * Insert after button
             */
            button.insertAdjacentElement(
                "afterend",
                block
            );

        } catch (error) {

            console.error(
                "CipherGap decrypt error:",
                error
            );
        }
    },
    true
);



/**
 * Observe Bale messages
 */
function check_encrypt_message_exists_in_bale() {

    const messagesContainer =
        document.querySelector(
            '[data-sentry-component="MessagesListFC"]'
        );

    if (!messagesContainer) {

        console.log(
            "CipherGap: messages container not found"
        );

        return;
    }


    const PACKET_REGEX =
        /^CGP\|\d+\|AESGCM\|\d+\|.+$/;

    let counter = 0;


    function process_messages() {

        const elements =
            messagesContainer.querySelectorAll(
                "div, span, p"
            );

        for (const element of elements) {

            /**
             * Skip processed
             */
            if (
                element.dataset
                    .ciphergapProcessed
            ) {
                continue;
            }


            /**
             * Skip parent nodes
             */
            if (
                element.children.length > 0
            ) {
                continue;
            }


            const text =
                element.textContent?.trim();

            if (!text) {
                continue;
            }


            /**
             * Detect packet
             */
            if (
                !PACKET_REGEX.test(text)
            ) {
                continue;
            }


            /**
             * Mark processed
             */
            element.dataset
                .ciphergapProcessed =
                "true";


            /**
             * Unique ID
             */
            const messageId =
                `ciphergap-msg-${counter++}`;

            element.id =
                messageId;


            /**
             * Store packet
             */
            element.dataset
                .ciphergapPacket =
                text;


            /**
             * Create button
             */
  const button =
    document.createElement(
        "button"
    );

button.className =
    "ciphergap-decrypt-btn";

button.innerText =
    "Decrypt";

button.dataset.packet =
    text;


            Object.assign(
                button.style,
                {
                    marginTop: "6px",
                    marginLeft: "6px",
                    fontSize: "11px",
                    border: "none",
                    borderRadius: "6px",
                    padding: "2px 8px",
                    cursor: "pointer",
                    background: "#2563eb",
                    color: "white"
                }
            );


            /**
             * Insert button
             */
            element.insertAdjacentElement(
                "afterend",
                button
            );
        }
    }


    /**
     * Initial scan
     */
    process_messages();


    /**
     * Observe DOM
     */
    const observer =
        new MutationObserver(
            () => {

                process_messages();
            }
        );

    observer.observe(
        messagesContainer,
        {
            childList: true,
            subtree: true
        }
    );


    console.log(
        "CipherGap observer started"
    );
}