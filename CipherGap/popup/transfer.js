export function setup_transfer(ui) {
    const transfer = CipherGapShared.key_transfer, keys = CipherGapShared.storage_keys;
    const el = id => document.getElementById(id);
    let busy = false, stream = null, scanTimer = null;
    async function run(button, action) {
        if (busy) return;
        busy = true; button.disabled = true; button.setAttribute("aria-busy", "true");
        try { await action(); }
        catch (error) { ui.status(error.message || "Transfer failed. Nothing was imported.", "error"); }
        finally { busy = false; button.disabled = false; button.removeAttribute("aria-busy"); await ui.refresh().catch(() => {}); }
    }
    async function download(name, type, data) {
        if (globalThis.CipherGapHost?.download) return CipherGapHost.download({name,type,data});
        const url = URL.createObjectURL(new Blob([data], {type})), a = document.createElement("a");
        a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function destination() {
        const c = ui.context();
        if (!c.ready || !c.storageKey) throw new Error("Open a supported chat first.");
        return c.storageKey;
    }
    async function apply(plan, target = null) {
        const names = [...new Set([...Object.keys(plan.values), ...plan.remove])];
        const before = await chrome.storage.local.get(names);
        for (const id of plan.chats) {
            if (["waiting","incoming"].includes(before[keys.exchange_status(id)]?.status)) throw new Error("Finish or decline the current key exchange before importing.");
        }
        const replaced = plan.chats.filter(id => before[id] && before[id] !== plan.values[id]).length;
        const approved = await ui.confirm({title:"Review import",message:CipherGapShared.i18n.translate("Chats in this import: {chats}. Existing keys to replace: {replaced}. Unrelated chats are kept.").replace("{chats}",plan.chats.length).replace("{replaced}",replaced),confirmLabel:"Import"});
        if (!approved) return;
        if (target && destination() !== target) throw new Error("The destination chat changed. Nothing was imported.");
        if (target && !(await ui.checkContext())?.ok) throw new Error("The destination chat changed. Nothing was imported.");
        const latest = await chrome.storage.local.get(names);
        if (names.some(name => JSON.stringify(before[name]) !== JSON.stringify(latest[name]))) throw new Error("Settings changed while reviewing. Try importing again.");
        // One storage write publishes keys and their trust/settings together.
        await chrome.storage.local.set(plan.values);
        if (plan.remove.length) await chrome.storage.local.remove(plan.remove);
        ui.status(target ? "Key imported. Identity remains unverified." : "Import complete.", "success");
        el("backupPassword").value = ""; el("qrTextInput").value = "";
    }
    for (const [id, single] of [["exportAllBtn",false],["exportChatBtn",true]]) {
        el(id).addEventListener("click", event => run(event.currentTarget, async () => {
            const state = await chrome.storage.local.get(null);
            if (!state[keys.ui_theme] && localStorage.getItem(keys.ui_theme)) state[keys.ui_theme] = localStorage.getItem(keys.ui_theme);
            const backup = transfer.snapshot(state, single ? destination() : null);
            const text = await transfer.seal(backup, el("backupPassword").value);
            await download(single ? "ciphergap-chat.ciphergap" : "ciphergap-backup.ciphergap", "application/octet-stream", new TextEncoder().encode(text).buffer);
            el("backupPassword").value = ""; ui.status("Encrypted backup prepared. Keep its password separately.", "success");
        }));
    }
    el("importBackupBtn").addEventListener("click", () => el("backupFileInput").click());
    el("backupFileInput").addEventListener("change", event => run(el("importBackupBtn"), async () => {
        const file = event.target.files[0], target = el("importTarget").value === "current" ? destination() : null;
        event.target.value = "";
        if (!file) return;
        if (file.size > transfer.MAX_BYTES) throw new Error("The backup exceeds the safety limit.");
        const backup = await transfer.open(await file.text(), el("backupPassword").value);
        await apply(transfer.plan_import(backup, target), target);
    }));
    const qrDialog = el("qrDialog"), qrCanvas = el("keyQrCanvas");
    el("shareQrBtn").addEventListener("click", event => run(event.currentTarget, async () => {
        const target = destination(), key = ui.context().key;
        if (!key) throw new Error("No chat key is available to export.");
        if (!await ui.confirm({title:"Share your chat key?",message:"Anyone who scans this QR gets your chat key. Show it privately.",confirmLabel:"Show key QR"})) return;
        const state = await chrome.storage.local.get(target);
        if (destination() !== target || state[target] !== key || !(await ui.checkContext())?.ok) throw new Error("The destination chat changed. Nothing was imported.");
        const qr = qrcode(0,"M"); qr.addData(transfer.share_key(key)); qr.make();
        const cell = 5, margin = 4, modules = qr.getModuleCount();
        qrCanvas.width = qrCanvas.height = (modules + margin * 2) * cell;
        const context = qrCanvas.getContext("2d"); context.fillStyle = "white"; context.fillRect(0,0,qrCanvas.width,qrCanvas.height); context.fillStyle = "black";
        for (let y = 0; y < modules; y++) for (let x = 0; x < modules; x++) if (qr.isDark(y,x)) context.fillRect((x+margin)*cell,(y+margin)*cell,cell,cell);
        qrDialog.showModal();
    }));
    qrDialog.addEventListener("close", () => { qrCanvas.width = qrCanvas.height = 0; });
    el("saveQrBtn").addEventListener("click", event => run(event.currentTarget, async () => {
        const blob = await new Promise(resolve => qrCanvas.toBlob(resolve,"image/png"));
        if (blob) await download("ciphergap-key.png","image/png",await blob.arrayBuffer());
    }));
    async function import_packet(packet) {
        const target = destination();
        await apply(transfer.key_plan(transfer.read_key(packet), target), target);
    }
    el("importQrTextBtn").addEventListener("click", event => run(event.currentTarget, () => import_packet(el("qrTextInput").value)));
    function decode_image(source, width, height) {
        const scale = Math.min(1, 1280 / Math.max(width,height)), canvas = document.createElement("canvas");
        canvas.width = Math.max(1,Math.round(width*scale)); canvas.height = Math.max(1,Math.round(height*scale));
        const context = canvas.getContext("2d",{willReadFrequently:true}); context.drawImage(source,0,0,canvas.width,canvas.height);
        const data = context.getImageData(0,0,canvas.width,canvas.height);
        return jsQR(data.data,data.width,data.height)?.data;
    }
    el("readQrImageBtn").addEventListener("click", () => el("qrImageInput").click());
    el("qrImageInput").addEventListener("change", event => run(el("readQrImageBtn"), async () => {
        const file = event.target.files[0]; event.target.value = "";
        if (!file) return;
        if (file.size > 10 * 1024 * 1024 || !["image/png","image/jpeg","image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP QR image under 10 MB.");
        const image = await createImageBitmap(file);
        try {
            const packet = decode_image(image,image.width,image.height);
            if (!packet) throw new Error("No QR code was found in this image.");
            await import_packet(packet);
        } finally { image.close(); }
    }));
    const scanner = el("scannerDialog"), video = el("qrVideo");
    function stop_scan() { clearTimeout(scanTimer); stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; }
    scanner.addEventListener("close", stop_scan);
    window.addEventListener("pagehide", stop_scan);
    document.addEventListener("visibilitychange", () => { if (document.hidden) { if (scanner.open) scanner.close(); if (qrDialog.open) qrDialog.close(); stop_scan(); } });
    document.querySelectorAll('[role="tab"]').forEach(tab => tab.addEventListener("click", () => { if (scanner.open) scanner.close(); if (qrDialog.open) qrDialog.close(); }));
    chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes[ui.context().storageKey] && qrDialog.open) qrDialog.close(); });
    el("scanQrBtn").addEventListener("click", event => run(event.currentTarget, async () => {
        destination(); stop_scan();
        scanner.showModal(); el("scannerStatus").textContent = "Point the camera at a CipherGap key QR.";
        try {
            const acquired = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
            if (!scanner.open) { acquired.getTracks().forEach(track => track.stop()); return; }
            stream = acquired; video.srcObject = stream; await video.play(); ui.status("", "neutral");
            const scan = () => {
                if (!scanner.open) return;
                const packet = video.videoWidth && decode_image(video,video.videoWidth,video.videoHeight);
                if (packet) { scanner.close(); run(el("scanQrBtn"), () => import_packet(packet)); }
                else scanTimer = setTimeout(scan, 250);
            };
            scanTimer = setTimeout(scan,250);
        } catch { scanner.close(); throw new Error("Camera unavailable or permission denied. Use Read QR image instead."); }
    }));
}
