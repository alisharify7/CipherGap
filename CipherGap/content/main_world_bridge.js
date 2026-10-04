// Only ciphertext crosses this bridge. Messenger download URLs, keys and plaintext
// never need to leave their own browser contexts.
(function () {
    "use strict";
    let pending = null;
    let completedDownload = null;
    let picker = null;
    const inputClick = HTMLInputElement.prototype.click;
    const createObjectURL = URL.createObjectURL.bind(URL);
    const anchorClick = HTMLAnchorElement.prototype.click;
    const pageFetch = window.fetch.bind(window);

    window.addEventListener("message", (event) => {
        const data = event.data;
        if (event.source !== window || event.origin !== location.origin || data?.source !== "ciphergap-content") return;
        if (data.type === "cancel_picker" && picker?.id === data.id) picker = null;
        if (data.type === "prepare_picker" && typeof data.id === "string" && /^[a-f0-9-]{36}$/i.test(data.id)) {
            picker = { id: data.id, expires: Date.now() + 5000 };
            window.postMessage({ source: "ciphergap-main", type: "picker_ready", id: data.id }, location.origin);
            return;
        }
        if (data.type === "cancel_file" && pending?.id === data.id) pending = null;
        if (data.type !== "read_file" || typeof data.id !== "string" || typeof data.filename !== "string" || !data.filename.endsWith(".cgpe")) return;
        pending = { id: data.id, filename: data.filename, maxBytes: Math.min(Number(data.maxBytes) || 0, 101 * 1024 * 1024), expires: Date.now() + 45000, reading: false, documentId: /^\d+$/.test(data.documentId ?? "") ? data.documentId : null, transportArmed: false };
        window.postMessage({ source: "ciphergap-main", type: "file_ready", id: data.id }, location.origin);
    });

    HTMLInputElement.prototype.click = function () {
        if (this.type !== "file" || !picker || Date.now() > picker.expires) return inputClick.call(this);
        const request = picker;
        picker = null;
        this.dataset.ciphergapPickerId = request.id;
        // Telegram reuses a detached input. Its original onchange remains intact.
        if (!this.isConnected) {
            this.hidden = true;
            document.body.append(this);
        }
        window.postMessage({ source: "ciphergap-main", type: "picker_input", id: request.id }, location.origin);
    };

    // Eitaa streams native downloads through a short-lived same-origin iframe.
    // Arm only the exact document we requested; other downloads remain native.
    document.addEventListener("click", event => {
        const id = event.target?.closest?.("[data-doc-id]")?.dataset.docId;
        if (pending && id) pending.transportArmed = id === pending.documentId;
    }, true);
    if (location.hostname === "web.eitaa.com") {
        const src = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
        Object.defineProperty(HTMLIFrameElement.prototype, "src", {
            ...src,
            set(value) {
                const request = pending;
                const url = new URL(value, location.href);
                if (!request?.transportArmed || Date.now() > request.expires || url.origin !== location.origin || !/^\/d\/\d+$/.test(url.pathname)) return src.set.call(this, value);
                request.transportArmed = false;
                const frame = this;
                readBoundedResponse(url.href, request).then(async blob => {
                    if (!await reportBlob(blob, request)) throw new Error("Unrecognized encrypted download.");
                })
                    .catch(() => { if (pending === request) src.set.call(frame, value); });
            }
        });
    }
    async function readBoundedResponse(url, request) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(1, request.expires - Date.now()));
        try {
            const response = await pageFetch(url, { signal: controller.signal });
            if (!response.ok || Number(response.headers.get("Content-Length")) > request.maxBytes) throw new Error("Invalid encrypted download.");
            const reader = response.body.getReader(), chunks = [];
            let total = 0;
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                total += value.byteLength;
                if (pending !== request || total > request.maxBytes) { controller.abort(); throw new Error("Download cancelled or too large."); }
                chunks.push(value);
            }
            return new Blob(chunks);
        } finally { clearTimeout(timer); }
    }

    async function reportBlob(blob, request, blobURL = null) {
        if (!request || request !== pending || request.reading || Date.now() > request.expires || blob.size > request.maxBytes) return;
        const header = new Uint8Array(await blob.slice(0, 4105).arrayBuffer());
        if (header.length < 9 || header[0] !== 67 || header[1] !== 71 || header[2] !== 80 || header[3] !== 69) return;
        const length = new DataView(header.buffer).getUint32(5, true);
        if (length < 1 || length > 4096 || 9 + length > header.length) return;
        const filename = new TextDecoder().decode(header.slice(9, 9 + length)) + ".cgpe";
        if (filename !== request.filename || pending !== request) return;
        request.reading = true;
        const bytes = await blob.arrayBuffer();
        if (pending !== request) return;
        // Telegram can click its native download anchor after the ciphertext
        // has already reached our viewer. Suppress that exact URL once as well.
        if (blobURL) completedDownload = { url: blobURL, filename, expires: Date.now() + 10000 };
        pending = null;
        window.postMessage({ source: "ciphergap-main", type: "file_bytes", id: request.id, bytes }, location.origin, [bytes]);
        return true;
    }

    // A first click makes Bale fetch the file. Its Blob is available before a
    // second click would otherwise save the encrypted container.
    URL.createObjectURL = function (blob) {
        const url = createObjectURL(blob);
        if (blob instanceof Blob && pending) reportBlob(blob, pending, url).catch(() => {});
        return url;
    };

    // Cached files use a download anchor. Suppress only our requested encrypted
    // download; the content script will save the authenticated original instead.
    HTMLAnchorElement.prototype.click = function () {
        if (completedDownload && Date.now() <= completedDownload.expires && this.download === completedDownload.filename && this.href === completedDownload.url) {
            completedDownload = null;
            return;
        }
        const request = pending;
        if (request && Date.now() <= request.expires && this.download === request.filename && this.href.startsWith(`blob:${location.origin}/`)) {
            pageFetch(this.href).then((response) => response.blob())
                .then((blob) => reportBlob(blob, request)).catch(() => {});
            return;
        }
        return anchorClick.call(this);
    };
})();
