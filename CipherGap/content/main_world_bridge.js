// Only ciphertext crosses this bridge. Bale's download URLs, keys and plaintext
// never need to leave their own browser contexts.
(function () {
    "use strict";
    let pending = null;
    const createObjectURL = URL.createObjectURL.bind(URL);
    const anchorClick = HTMLAnchorElement.prototype.click;
    const pageFetch = window.fetch.bind(window);

    window.addEventListener("message", (event) => {
        const data = event.data;
        if (event.source !== window || event.origin !== location.origin || data?.source !== "ciphergap-content") return;
        if (data.type === "cancel_file" && pending?.id === data.id) pending = null;
        if (data.type !== "read_file" || typeof data.id !== "string" || typeof data.filename !== "string" || !data.filename.endsWith(".cgpe")) return;
        pending = { id: data.id, filename: data.filename, maxBytes: Math.min(Number(data.maxBytes) || 0, 101 * 1024 * 1024), expires: Date.now() + 45000, reading: false };
        window.postMessage({ source: "ciphergap-main", type: "file_ready", id: data.id }, location.origin);
    });

    async function reportBlob(blob, request) {
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
        pending = null;
        window.postMessage({ source: "ciphergap-main", type: "file_bytes", id: request.id, bytes }, location.origin, [bytes]);
    }

    // A first click makes Bale fetch the file. Its Blob is available before a
    // second click would otherwise save the encrypted container.
    URL.createObjectURL = function (blob) {
        const url = createObjectURL(blob);
        if (blob instanceof Blob && pending) reportBlob(blob, pending).catch(() => {});
        return url;
    };

    // Cached files use a download anchor. Suppress only our requested encrypted
    // download; the content script will save the authenticated original instead.
    HTMLAnchorElement.prototype.click = function () {
        const request = pending;
        if (request && Date.now() <= request.expires && this.download === request.filename && this.href.startsWith(`blob:${location.origin}/`)) {
            pageFetch(this.href).then((response) => response.blob())
                .then((blob) => reportBlob(blob, request)).catch(() => {});
            return;
        }
        return anchorClick.call(this);
    };
})();
