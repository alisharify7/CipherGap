// Runs only in the trusted local UI or WebView's named isolated execution world.
(function () {
    const pending = new Map(), listeners = new Set(), changes = new Set();
    let serial = 0;
    function request(op, data = {}) {
        return new Promise((resolve, reject) => {
            const id = String(++serial);
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('The Android host did not respond.')); }, 60000);
            pending.set(id, {resolve, reject, timer});
            cgNative.postMessage(JSON.stringify({id, op, ...data}));
        });
    }
    cgNative.onmessage = async event => {
        const message = JSON.parse(event.data);
        if (message.type === 'changes') {
            for (const listener of changes) listener(message.changes, 'local');
        } else if (message.type === 'runtime') {
            let responded = false;
            const respond = value => {
                if (responded) return;
                responded = true;
                request('action_result', {token: message.token, result: value}).catch(() => {});
            };
            try {
                for (const listener of listeners) {
                    const handled = listener(message.message, {}, respond);
                    if (handled || responded) return;
                }
                respond({ok: false, error: 'This action is unavailable.'});
            } catch (error) { respond({ok: false, error: error.message}); }
        } else if (message.type === 'response') {
            const entry = pending.get(message.id);
            if (!entry) return;
            clearTimeout(entry.timer); pending.delete(message.id);
            message.error ? entry.reject(new Error(message.error)) : entry.resolve(message.result);
        }
    };
    const eventAPI = set => ({ addListener: f => set.add(f), removeListener: f => set.delete(f) });
    globalThis.chrome = {
        storage: { local: {
            get: keys => request('get', {keys: keys ?? null}),
            set: values => request('set', {values}),
            remove: keys => request('remove', {keys})
        }, onChanged: eventAPI(changes) },
        runtime: {
            getManifest: () => CIPHERGAP_MANIFEST,
            getURL: path => 'https://appassets.androidplatform.net/assets/extension/' + path,
            sendMessage: message => request('open_security', {message}),
            onMessage: eventAPI(listeners)
        },
        tabs: {
            query: () => request('tabs').then(tab => tab ? [tab] : []),
            get: () => request('tabs'),
            sendMessage: (id, message) => request('action', {message})
        }
    };
    globalThis.CipherGapHost = {
        mobile: true,
        trustedUI: location.origin === 'https://appassets.androidplatform.net',
        request,
        messageObserved: event => request('notify', {event}).catch(() => {}),
        async download(file) {
            let transfer;
            try {
                const bytes = new Uint8Array(file.data);
                transfer = await request('download_begin', {name: file.name, mime: file.type, size: bytes.length});
                for (let offset = 0; offset < bytes.length; offset += 49152) {
                    const chunk = bytes.subarray(offset, offset + 49152);
                    await request('download_chunk', {transfer, data: btoa(String.fromCharCode(...chunk))});
                }
                await request('download_finish', {transfer});
            } catch (error) {
                if (transfer) await request('download_cancel', {transfer}).catch(() => {});
                // User-visible error, without putting keys or content in system logs.
                if (typeof show_ciphergap_notice === 'function') show_ciphergap_notice(error.message, 'error', 7000);
                else throw error;
            }
        }
    };
    if (CipherGapHost.trustedUI) {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            setItem.call(this, key, value);
            if (this === localStorage && key === 'ciphergap_ui_theme')
                chrome.storage.local.set({[key]: value}).catch(() => {});
        };
        chrome.storage.local.get('ciphergap_ui_theme').then(state => {
            const theme = state.ciphergap_ui_theme;
            if (theme === 'light' || theme === 'dark') {
                setItem.call(localStorage, 'ciphergap_ui_theme', theme);
                document.documentElement.dataset.theme = theme;
            }
        }).catch(() => {});
        changes.add(diff => {
            if (diff.ciphergap_ui_theme?.newValue) {
                setItem.call(localStorage, 'ciphergap_ui_theme', diff.ciphergap_ui_theme.newValue);
                document.documentElement.dataset.theme = diff.ciphergap_ui_theme.newValue;
            }
        });
    }
    request('ready').catch(() => {});
})();
