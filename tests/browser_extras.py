"""Search, review-before-send and key lifecycle in real Chromium.

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
    def receive(packet):
        sid = pages[1].evaluate("t=>addMessage(t)", packet); row = pages[1].locator('[data-msg-id="' + sid + '"] [rb-message-item]')
        row.locator(".ciphergap-decrypt-button").click(); row.locator(".ciphergap-plaintext").wait_for(); return row

    # Review before sending: Cancel sends nothing, Send delivers.
    worker.evaluate("chrome.storage.local.set({ciphergap_preview_send:true})")
    pages[0].wait_for_timeout(400)
    pages[0].locator("[contenteditable=true]").fill("needs review"); pages[0].locator("#ciphergap-btn").click()
    dialog = pages[0].locator('dialog[data-ciphergap-ui="send-preview"]'); dialog.wait_for()
    assert "needs review" in dialog.inner_text() and "CGP|2|" in dialog.inner_text()
    sent_before = pages[0].evaluate("testSent.length")
    dialog.get_by_role("button", name="Cancel").click(); pages[0].wait_for_function('!document.querySelector("dialog[data-ciphergap-ui=send-preview]")')
    pages[0].wait_for_function('!document.getElementById("ciphergap-btn").disabled')
    assert pages[0].evaluate("testSent.length") == sent_before, "cancel must not send"
    pages[0].locator("#ciphergap-btn").click(); dialog.wait_for(); dialog.get_by_role("button", name="Send").click()
    pages[0].wait_for_function(f"testSent.length=={sent_before}+1")
    first = receive(pages[0].evaluate("testSent.at(-1)")); assert first.locator(".ciphergap-plaintext").inner_text() == "needs review"
    worker.evaluate("chrome.storage.local.set({ciphergap_preview_send:false})"); pages[0].wait_for_timeout(400)
    print("PASS review before sending: cancel keeps the draft unsent, send delivers")

    # Search among decrypted messages in the receiving chat.
    receive(send("lunch at noon")); receive(send("see you tomorrow")); receive(send("Lunch menu attached"))
    pages[1].locator("#ciphergap-search").click()
    box = pages[1].locator('[data-ciphergap-ui="search"] input'); box.fill("lunch")
    pages[1].wait_for_function('document.querySelectorAll("[data-ciphergap-search-hit]").length===2', timeout=8000)
    assert "1 / 2" in pages[1].locator(".ciphergap-search-bar__count").inner_text()
    box.press("Enter"); assert "2 / 2" in pages[1].locator(".ciphergap-search-bar__count").inner_text()
    box.fill("zzz"); pages[1].wait_for_function('document.querySelectorAll("[data-ciphergap-search-hit]").length===0')
    pages[1].locator('[data-ciphergap-ui="search"] button').last.click(); assert pages[1].locator('[data-ciphergap-ui="search"]').count() == 0
    print("PASS search finds decrypted messages case-insensitively and cycles matches")

    # Key lifecycle in the popup.
    pop = ctx.new_page(); pop.set_viewport_size({"width": 440, "height": 600})
    pop.goto(worker.url.rsplit("/", 1)[0] + f"/popup/popup.html?tabId={tabs[0]}"); pop.wait_for_timeout(1200)
    pop.wait_for_selector("#keyLifecycle:not([hidden])", state="attached", timeout=10000)
    text = pop.locator("#keyLifecycle").text_content()
    assert "Forward secrecy" in text and "Readable since" in text and "Verified" in text, text
    print("PASS popup shows the key lifecycle (type, readable-since date, verification)")
    assert not errors, errors
    ctx.close()
