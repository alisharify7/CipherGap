const languageSelect = document.getElementById("language-select");
const textOriginals = new WeakMap();
const attributeOriginals = new WeakMap();
function setLanguage(language) {
    const english = language === "en";
    document.documentElement.lang = english ? "en" : "fa";
    document.documentElement.dir = english ? "ltr" : "rtl";
    languageSelect.value = english ? "en" : "fa";
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (node.parentElement.closest("script, style, option")) continue;
        if (!textOriginals.has(node)) textOriginals.set(node, node.nodeValue);
        const original = textOriginals.get(node);
        const normalized = original.trim().replace(/\s+/g, " ");
        const translated = window.CipherGapEnglish[normalized];
        node.nodeValue = english && translated ? original.replace(original.trim(), translated) : original;
    }
    for (const element of document.querySelectorAll("[aria-label], [alt], meta[content]")) {
        const saved = attributeOriginals.get(element) || {};
        for (const attribute of ["aria-label", "alt", "content"]) {
            if (!element.hasAttribute(attribute)) continue;
            saved[attribute] ??= element.getAttribute(attribute);
            const original = saved[attribute];
            const translated = window.CipherGapEnglish[original];
            element.setAttribute(attribute, english && translated ? translated : original);
        }
        attributeOriginals.set(element, saved);
    }
    try { localStorage.setItem("ciphergap-language", language); } catch { /* Storage may be blocked. */ }
}
languageSelect.addEventListener("change", event => setLanguage(event.target.value));
let savedLanguage;
try { savedLanguage = localStorage.getItem("ciphergap-language"); } catch { /* Use the page default. */ }
setLanguage(savedLanguage === "fa" ? "fa" : "en");
const menu = document.querySelector(".menu-button");
const navigation = document.getElementById("main-nav");
function closeMenu() {
    menu.setAttribute("aria-expanded", "false");
    navigation.dataset.open = "false";
}
menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    navigation.dataset.open = String(open);
});
navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
        closeMenu();
        menu.focus();
    }
});
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab, focus = false) {
    for (const item of tabs) {
        const selected = item === tab;
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
        document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
    }
    if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
        const offset = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index }[event.key];
        if (offset === undefined) return;
        event.preventDefault();
        selectTab(tabs[(index + offset + tabs.length) % tabs.length], true);
    });
});
const status = document.getElementById("copy-status");
let statusTimer;
document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(button.dataset.copy);
            status.textContent = document.documentElement.lang === "en" ? "Address copied. Paste it into your browser’s address bar." : "آدرس کپی شد؛ آن را در نوار آدرس مرورگر وارد کنید.";
        } catch {
            status.textContent = document.documentElement.lang === "en" ? "Automatic copying is unavailable. Select and copy the address beside the button." : "کپی خودکار در این مرورگر در دسترس نیست؛ آدرس کنار دکمه را انتخاب و کپی کنید.";
        }
        status.hidden = false;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { status.hidden = true; }, 5500);
    });
});
