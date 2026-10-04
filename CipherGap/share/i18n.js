// Translate only CipherGap-owned UI. Chat text, keys and protocol bytes are untouched.
(function (shared) {
    const key = shared.storage_keys.ui_language;
    let language = navigator.language.startsWith("fa") ? "fa" : "en";
    const originals = new WeakMap();
    const attributes = new WeakMap();
    const scoped = Boolean(location.protocol === "https:");
    const selector = '[data-ciphergap-ui], #ciphergap-btn, #ciphergap-toolbar, #ciphergap-live-notice';
    const patterns = [
        [/^Insert emoji: (.+)$/, x => `افزودن شکلک: ${x}`],
        [/^Send sticker: (.+)$/, x => `ارسال استیکر: ${x}`],
        [/^CipherGap · (.+)$/, x => `CipherGap · ${translate(x)}`],
        [/^Current (.+) chat$/, x => `گفتگوی فعلی ${x}`],
        [/^Chat ID ending (.+) · Settings apply only to this conversation\.$/, x => `انتهای شناسهٔ گفتگو: ${x} · تنظیمات فقط برای همین گفتگو هستند.`],
        [/^Stable chat identifier: (.+)\.$/, x => `شناسهٔ ثابت گفتگو: ${x}`],
        [/^Fingerprint: (.+)$/, x => `اثر انگشت: ${x}`],
        [/^Previous fingerprint: (.+)$/, x => `اثر انگشت قبلی: ${x}`],
        [/^Verified (.+)\.$/, x => `تأیید شده در ${x}`],
        [/^(.+) was decrypted and downloaded\.$/, x => `${x} رمزگشایی و دانلود شد.`],
        [/^(\d+) attachments? encrypted and ready to send\.$/, x => `${x} فایل رمزگذاری شد و آمادهٔ ارسال است.`],
        [/^Attachment not sent: (.+)$/, x => `فایل ارسال نشد: ${translate(x)}`],
        [/^File decryption failed: (.+)$/, x => `رمزگشایی فایل ناموفق بود: ${translate(x)}`],
        [/^Switch to (dark|light) theme$/, x => x === "dark" ? "تغییر به ظاهر تیره" : "تغییر به ظاهر روشن"]
    ];
    function translate(value) {
        if (language !== "fa") return value;
        const normalized = value.trim().replace(/\s+/g, " ");
        if (shared.fa[normalized]) return value.replace(value.trim(), shared.fa[normalized]);
        for (const [pattern, format] of patterns) {
            const match = normalized.match(pattern);
            if (match) return format(...match.slice(1));
        }
        return value;
    }
    function update(root) {
        const owned = scoped ? root.closest?.(selector) : root;
        if (!owned) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.parentElement.closest('script, style, code, textarea, option, [translate="no"]')) continue;
            const previous = originals.get(node);
            const original = previous && node.nodeValue === previous.translated ? previous.original : node.nodeValue;
            const translated = translate(original);
            originals.set(node, { original, translated });
            if (node.nodeValue !== translated) node.nodeValue = translated;
        }
        const elements = [root, ...root.querySelectorAll('[title], [aria-label], [placeholder]')];
        for (const element of elements) {
            if (!(element instanceof Element)) continue;
            const saved = attributes.get(element) || {};
            for (const attr of ['title', 'aria-label', 'placeholder']) {
                if (!element.hasAttribute(attr)) continue;
                const current = element.getAttribute(attr);
                const original = saved[attr] && current === saved[attr].translated ? saved[attr].original : current;
                const translated = translate(original);
                saved[attr] = { original, translated };
                if (current !== translated) element.setAttribute(attr, translated);
            }
            attributes.set(element, saved);
        }
        if (scoped && root.matches?.(selector)) {
            const dir = language === 'fa' ? 'rtl' : 'ltr';
            if (root.dir !== dir) root.dir = dir;
            if (root.lang !== language) root.lang = language;
        }
    }
    function refresh() {
        if (!document.body) return;
        if (scoped) document.querySelectorAll(selector).forEach(update);
        else {
            document.documentElement.lang = language;
            document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
            const select = document.getElementById('languageSelect');
            if (select) select.value = language;
            update(document.body);
        }
    }
    let pending = false;
    function schedule() {
        if (pending) return;
        pending = true;
        queueMicrotask(() => { pending = false; refresh(); });
    }
    async function setLanguage(value) {
        await chrome.storage.local.set({ [key]: value === 'fa' ? 'fa' : 'en' });
    }
    shared.i18n = Object.freeze({ translate, setLanguage, getLanguage: () => language });
    chrome.storage.local.get(key).then(result => {
        if (['fa', 'en'].includes(result[key])) language = result[key];
        refresh();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[key]) {
            language = changes[key].newValue === 'fa' ? 'fa' : 'en';
            refresh();
        }
    });
    function start() {
        refresh();
        new MutationObserver(mutations => {
            if (!scoped || mutations.some(m => m.target.parentElement?.closest(selector) || m.target.closest?.(selector) || [...m.addedNodes].some(n => n.matches?.(selector) || n.querySelector?.(selector)))) schedule();
        }).observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})(globalThis.CipherGapShared);
