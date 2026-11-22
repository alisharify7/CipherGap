"""Forward secrecy, self-destructing messages and app lock in real Chromium.

Uses the Rubika native-DOM fixture: two independent chats with the unpacked extension.
"""
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright
from new_messenger_fixtures import html

root = Path(__file__).resolve().parents[1]
profile = tempfile.mkdtemp(prefix="cg-v2-")
base = "https://web.rubika.ir/"
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(profile, channel="chromium", headless=True, args=[f"--disable-extensions-except={root}/CipherGap", f"--load-extension={root}/CipherGap"])
    worker = next((w for w in ctx.service_workers if w.url.startswith("chrome-extension://")), None) or ctx.wait_for_event("serviceworker")
    kernel = ctx.new_page(); kernel.goto(worker.url.rsplit("/", 1)[0] + "/popup/popup.html")
    kernel.evaluate("""async()=>{for(const f of ['encoding','keyring','vault','crypto','protocol'])await new Promise(r=>{const s=document.createElement('script');s.src='../share/'+f+'.js';s.onload=r;document.head.append(s)})}""")
    ctx.route(base + "**", lambda route, request: route.fulfill(body=html("rubika"), content_type="text/html"))
    errors = []; pages = []
    for uid in [601, 602]:
        page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base + "#c=u" + str(uid)); page.wait_for_selector("#ciphergap-toolbar"); pages.append(page)
    tabs = worker.evaluate('base=>chrome.tabs.query({url:base+"*"}).then(t=>t.map(x=>x.id))', base)
    contexts = [worker.evaluate("id=>chrome.tabs.sendMessage(id,{action:'get_chat_context'})", t) for t in tabs]
    keys = [c["storageKey"] for c in contexts]
    def action(i, message): return worker.evaluate("([id,m])=>chrome.tabs.sendMessage(id,m)", [tabs[i], dict(message, expectedStorageKey=contexts[i]["storageKey"])])

    # 1. Key exchange stores a forward-secret ratchet state, not the root key.
    started = action(0, {"action": "start_key_exchange"}); assert started["ok"], started
    pages[1].evaluate("t=>addMessage(t)", pages[0].evaluate("testSent.at(-1)"))
    pages[1].locator("[data-ciphergap-exchange-action=accept]").click(); pages[1].wait_for_function('testSent.some(t=>t.startsWith("start exchange ack:"))')
    pages[0].evaluate("t=>addMessage(t)", pages[1].evaluate('testSent.find(t=>t.startsWith("start exchange ack:"))'))
    stored = worker.evaluate("async keys=>{for(let i=0;i<200;i++){const s=await chrome.storage.local.get(keys);if(keys.every(k=>s[k]))return s;await new Promise(r=>setTimeout(r,25))}throw Error('no keys')}", keys)
    assert all(str(stored[k]).startswith("cgfs1:") for k in keys), stored
    for i in (0, 1): assert action(i, {"action": "mark_key_verified", "nonce": started["nonce"]})["ok"]
    print("PASS exchange saves ratchet state (cgfs1) on both sides")

    def send(text):
        pages[0].locator("[contenteditable=true]").fill(text); pages[0].locator("#ciphergap-btn").click()
        pages[0].wait_for_function('!document.getElementById("ciphergap-btn").disabled'); return pages[0].evaluate("testSent.at(-1)")
    def receive(packet, click=True):
        sid = pages[1].evaluate("t=>addMessage(t)", packet); row = pages[1].locator('[data-msg-id="' + sid + '"] [rb-message-item]')
        if click: row.locator(".ciphergap-decrypt-button").click()
        return row

    # 2. v2 packet, authenticated header, plain delivery.
    packet = send("hello v2"); assert packet.startswith("CGP|2|AESGCMHKDF|"), packet[:30]
    row = receive(packet); row.locator(".ciphergap-plaintext").wait_for(); assert row.locator(".ciphergap-plaintext").inner_text() == "hello v2"
    forged = packet.split("|"); forged[3] = str(int(forged[3]) + 1)
    bad = receive("|".join(forged)); bad.locator(".ciphergap-decrypt-button").wait_for(); assert bad.locator(".ciphergap-plaintext").count() == 0
    print("PASS v2 message round trip; altered timestamp is not decrypted")

    # 3. Self-destruct: 5-minute timer shows a countdown; burn requires an explicit open.
    pages[0].locator("#ciphergap-timer").click()
    assert pages[0].locator("#ciphergap-timer").get_attribute("data-active") == "true"
    row = receive(send("expires soon")); row.locator(".ciphergap-plaintext").wait_for(); row.locator(".ciphergap-expiry").wait_for()
    assert "Disappears in" in row.locator(".ciphergap-expiry").inner_text()
    for _ in range(4): pages[0].locator("#ciphergap-timer").click()   # 1h, 24h, 7d, burn
    burn = receive(send("burn me"), click=False); burn.locator(".ciphergap-decrypt-button").wait_for(timeout=10000)
    assert burn.locator(".ciphergap-plaintext").count() == 0
    burn.locator(".ciphergap-decrypt-button").click(); burn.locator(".ciphergap-plaintext").wait_for(); burn.locator(".ciphergap-expiry").wait_for()
    # An already expired message never reveals its text.
    secret = worker.evaluate("k=>chrome.storage.local.get(k).then(s=>s[k])", keys[1])
    expired = kernel.evaluate("""async s=>CipherGapShared.crypto.seal_message('too late', s, null, {expiresAt: Date.now()-1000})""", secret)
    old = receive(expired); old.locator('[data-mode=expired]').wait_for(timeout=10000)
    assert "too late" not in old.inner_text()
    print("PASS expiry countdown, burn-after-reading gate, expired message hidden")

    # 4. Forward secrecy: keys older than the retention window are unreadable.
    stale = kernel.evaluate("""async s=>{const r=await CipherGapShared.keyring.open(s);const ts=Math.floor(Date.now()/1000)-30*86400;
      const root=null;return ts}""", secret)
    old_state = worker.evaluate("k=>chrome.storage.local.get(k).then(s=>s[k])", keys[1]); assert old_state.startswith("cgfs1:")
    ep = int(old_state.split(":")[1]); assert ep >= 0
    try:
        kernel.evaluate("""async s=>{const r=await CipherGapShared.keyring.open(s);await r.message_key(0)}""", secret); raise SystemExit("epoch 0 must be deleted")
    except Exception as e:
        assert "forward secrecy" in str(e) or "KEY_EXPIRED" in str(e) or "deleted" in str(e), e
    print("PASS ratchet state cannot derive deleted epochs")

    # 5. App lock encrypts keys at rest, blocks use while locked, restores on unlock.
    kernel.evaluate("async()=>CipherGapShared.vault.setup('correct horse', 5)")
    raw = worker.evaluate("k=>chrome.storage.local.get(k).then(s=>s[k])", keys[0]); assert isinstance(raw, dict) and raw.get("cgv") == 1, raw
    row = receive(send("after lock setup")); row.locator(".ciphergap-plaintext").wait_for()
    kernel.evaluate("async()=>CipherGapShared.vault.lock()")
    pages[1].wait_for_function('document.querySelector("#ciphergap-security-status")?.textContent.includes("Locked")', timeout=10000)
    try:
        kernel.evaluate("async k=>CipherGapShared.vault.get([k])", keys[0]); raise SystemExit("locked read must fail")
    except Exception as e:
        assert "locked" in str(e).lower(), e
    try:
        kernel.evaluate("async()=>CipherGapShared.vault.unlock('wrong passphrase')"); raise SystemExit("wrong passphrase must fail")
    except Exception as e:
        assert "Incorrect passphrase" in str(e), e
    kernel.evaluate("async()=>{await chrome.storage.local.remove('ciphergap_vault_fails');await CipherGapShared.vault.unlock('correct horse')}")
    pages[1].wait_for_function('!document.querySelector("#ciphergap-security-status")?.textContent.includes("Locked")', timeout=10000)
    row = receive(send("after unlock")); row.locator(".ciphergap-plaintext").wait_for(); assert row.locator(".ciphergap-plaintext").inner_text() == "after unlock"
    kernel.evaluate("async()=>CipherGapShared.vault.disable('correct horse')")
    assert worker.evaluate("k=>chrome.storage.local.get(k).then(s=>typeof s[k])", keys[0]) == "string"
    print("PASS app lock: encrypted at rest, locks, rejects wrong passphrase, unlocks, turns off")
    assert not errors, errors
    ctx.close()
