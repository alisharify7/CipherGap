// Shared presentation: adapters obtain bytes; file_crypto authenticates/decrypts them.
(function (shared) {
    let active = null;
    const mediaTypes = {
        'image/png': 'img', 'image/jpeg': 'img', 'image/gif': 'img', 'image/webp': 'img', 'image/avif': 'img', 'image/bmp': 'img',
        'video/mp4': 'video', 'video/webm': 'video', 'video/ogg': 'video',
        'audio/mpeg': 'audio', 'audio/ogg': 'audio', 'audio/wav': 'audio', 'audio/x-wav': 'audio', 'audio/webm': 'audio', 'audio/mp4': 'audio', 'audio/flac': 'audio'
    };
    const mimeAliases = { 'audio/vnd.wave': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/x-flac': 'audio/flac', 'audio/mp3': 'audio/mpeg', 'image/jpg': 'image/jpeg', 'video/x-m4v': 'video/mp4' };
    const extensionTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg' };
    function download(file) {
        const url = URL.createObjectURL(new Blob([file.data], { type: file.type }));
        const link = document.createElement('a');
        link.href = url; link.download = shared.file_crypto.sanitize_cgpe_filename(file.name); link.hidden = true;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    function close() { active?.close(); }
    function open(file) {
        close();
        const previousFocus = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.className = 'ciphergap-file-viewer'; dialog.dataset.ciphergapUi = 'file-viewer';
        const title = document.createElement('h2'); title.id = 'ciphergap-file-viewer-title'; title.textContent = file.name; title.setAttribute('translate', 'no');
        dialog.setAttribute('aria-labelledby', title.id);
        const header = document.createElement('header');
        const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = 'Close';
        dismiss.addEventListener('click', () => dialog.close()); header.append(title, dismiss);
        const body = document.createElement('div'); body.className = 'ciphergap-file-viewer__body';
        const declared = String(file.type).toLowerCase().split(';')[0].trim();
        // File pickers on Firefox/Linux use audio/vnd.wave; some report no MIME.
        // Only known passive media extensions can supply a missing type.
        const type = mimeAliases[declared] || ((!declared || declared === 'application/octet-stream')
            ? extensionTypes[String(file.name).split('.').at(-1).toLowerCase()] || declared : declared);
        const kind = mediaTypes[type];
        let url = null;
        let media = null;
        const showFallback = () => {
            media?.remove();
            const hint = document.createElement('p');
            hint.textContent = 'Preview unavailable in this browser. Download the decrypted file to open it.';
            if (!body.querySelector('p')) body.append(hint);
        };
        if (kind) {
            // SVG and HTML are active documents; never embed them in a preview.
            media = document.createElement(kind); url = URL.createObjectURL(new Blob([file.data], { type })); media.src = url;
            if (kind === 'img') media.alt = file.name;
            else { media.controls = true; media.preload = 'metadata'; media.playsInline = true; }
            media.addEventListener('error', showFallback, { once: true }); body.append(media);
        } else showFallback();
        const footer = document.createElement('footer');
        const label = document.createElement('span'); label.textContent = 'Decrypted locally · original file';
        const save = document.createElement('button'); save.type = 'button'; save.className = 'ciphergap-file-viewer__download'; save.textContent = 'Download';
        save.addEventListener('click', () => download(file)); footer.append(label, save); dialog.append(header, body, footer);
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
        });
        dialog.addEventListener('close', () => {
            media?.pause?.();
            if (media) { media.removeAttribute('src'); media.load?.(); }
            if (url) URL.revokeObjectURL(url);
            dialog.remove(); if (active === dialog) active = null;
            if (previousFocus?.isConnected) previousFocus.focus();
        }, { once: true });
        document.body.append(dialog); active = dialog; dialog.showModal(); dismiss.focus();
        return dialog;
    }
    shared.file_viewer = Object.freeze({ open, close, download });
})(globalThis.CipherGapShared);
