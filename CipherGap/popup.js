// popup.js

const secretKeyInput =
    document.getElementById("secretKey");

const saveBtn =
    document.getElementById("saveBtn");

const savedKeyEl =
    document.getElementById("savedKey");

const siteNameEl =
    document.getElementById("siteName");

const statusEl =
    document.getElementById("status");

const emptyState =
    document.getElementById("emptyState");

const savedState =
    document.getElementById("savedState");

const supportedHosts = [
    "web.rubika.ir",
    "web.splus.ir",
    "web.bale.ai",
    "web.eitaa.com"
];

let currentHostname = null;
let currentChatId = null;
let storageKey = null;


async function init() {

    const [tab] =
        await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

    const url =
        new URL(tab.url);

    currentHostname =
        url.hostname;

    currentChatId =
        url.searchParams.get("uid");

    storageKey =
        currentChatId
            ? `${currentHostname}_${currentChatId}`
            : currentHostname;

    siteNameEl.innerText =
    currentChatId
        ? `${currentHostname} • Chat ${currentChatId}`
        : currentHostname;


    // بررسی پشتیبانی سایت
    if (!supportedHosts.includes(currentHostname)) {

        showUnsupportedState();

        return;
    }

    loadSavedKey();
}

function showUnsupportedState() {

    emptyState.classList.remove("hidden");

    savedState.classList.add("hidden");

    emptyState.innerHTML = `
        <div class="empty-icon">
            🚫
        </div>

        <div class="empty-title">
            Unsupported Website
        </div>

        <div class="empty-text">
            CipherGap does not support this website.
        </div>
    `;

    secretKeyInput.disabled = true;

    saveBtn.disabled = true;

    saveBtn.style.opacity = "0.5";

    saveBtn.style.cursor = "not-allowed";

    statusEl.innerText = "";
}

async function loadSavedKey() {

    const result =
        await chrome.storage.local.get([
            storageKey
        ]);

    const savedKey =
        result[storageKey];

    if (savedKey) {

        savedState.classList.remove("hidden");

        emptyState.classList.add("hidden");

        savedKeyEl.innerText =
            savedKey;

        secretKeyInput.value =
            savedKey;

    } else {

        savedState.classList.add("hidden");

        emptyState.classList.remove("hidden");

        emptyState.innerHTML = `
            <div class="empty-icon">
                ⚠️
            </div>

            <div class="empty-title">
                No Key Configured
            </div>

            <div class="empty-text">
                Please set a secret key for this website.
            </div>
        `;
    }
}

saveBtn.addEventListener(
    "click",
    async () => {

        if (!supportedHosts.includes(currentHostname)) {
            return;
        }

        const key =
            secretKeyInput.value.trim();

        if (!key) {

            statusEl.innerText =
                "❌ Please enter a key";

            return;
        }

        await chrome.storage.local.set({
            [storageKey]: key
        });

        statusEl.innerText =
            "✅ Key saved successfully";

        loadSavedKey();
    }
);

init();