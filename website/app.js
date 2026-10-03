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
            status.textContent = "آدرس کپی شد؛ آن را در نوار آدرس مرورگر وارد کنید.";
        } catch {
            status.textContent = "کپی خودکار در این مرورگر در دسترس نیست؛ آدرس کنار دکمه را انتخاب و کپی کنید.";
        }
        status.hidden = false;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { status.hidden = true; }, 5500);
    });
});
