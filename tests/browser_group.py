"""Secure group: one creator and two members, relayed like a real group chat."""
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright
from new_messenger_fixtures import html

root = Path(__file__).resolve().parents[1]
profile = tempfile.mkdtemp(prefix="cg-group-")
base = "https://web.rubika.ir/"
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(profile, channel="chromium", headless=True, args=[f"--disable-extensions-except={root}/CipherGap", f"--load-extension={root}/CipherGap"])
    worker = next((w for w in ctx.service_workers if w.url.startswith("chrome-extension://")), None) or ctx.wait_for_event("serviceworker")
    ctx.route(base + "**", lambda route, request: route.fulfill(body=html("rubika"), content_type="text/html"))
    errors = []; pages = []
    for uid in [701, 702, 703]:          # creator, member B, member C (each one's own view of the group)
        page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base + "#c=u" + str(uid)); page.wait_for_selector("#ciphergap-toolbar"); pages.append(page)
    tabs = worker.evaluate('base=>chrome.tabs.query({url:base+"*"}).then(t=>t.map(x=>x.id))', base)
    contexts = [worker.evaluate("id=>chrome.tabs.sendMessage(id,{action:'get_chat_context'})", t) for t in tabs]
    keys = [c["storageKey"] for c in contexts]
    def action(i, m): return worker.evaluate("([id,m])=>chrome.tabs.sendMessage(id,m)", [tabs[i], dict(m, expectedStorageKey=contexts[i]["storageKey"])])
    def relay(src, dst_list, startswith):
        text = pages[src].evaluate("p=>testSent.findLast(t=>t.startsWith(p))", startswith); assert text, startswith
        return [pages[d].evaluate("t=>addMessage(t)", text) for d in dst_list], text
    def row(i, sid): return pages[i].locator('[data-msg-id="' + sid + '"] [rb-message-item]')

    # Creator opens an invitation (no key existed before).
    r = action(0, {"action": "start_group_invite"}); assert r["ok"], r
    ids, invite = relay(0, [1, 2], "cg-group-invite|"); assert "|" in invite
    own = pages[0].evaluate("t=>addMessage(t)", invite)      # the creator also sees their own bubble
    assert worker.evaluate("k=>chrome.storage.local.get(k).then(s=>s[k])", keys[0]).startswith("cgfs1:")
    # Members see a card, not raw text, and join.
    for i, sid in ((1, ids[0]), (2, ids[1])):
        card = row(i, sid).locator('[data-ciphergap-ui="group-card"]'); card.wait_for()
        assert "cg-group-invite" not in card.locator("xpath=..").inner_text().split("Secure group")[0]
        card.locator("button").click()
        pages[i].wait_for_function('testSent.some(t=>t.startsWith("cg-group-join|"))')
    assert row(0, own).locator('[data-ciphergap-ui="group-card"] button').count() == 0 or row(0, own).locator('[data-ciphergap-ui="group-card"] .ciphergap-chat-card__actions').first.is_hidden()
    # Creator sees both join requests and approves only member B.
    join_b, join_c = [pages[i].evaluate('testSent.findLast(t=>t.startsWith("cg-group-join|"))') for i in (1, 2)]
    sb = pages[0].evaluate("t=>addMessage(t)", join_b); sc = pages[0].evaluate("t=>addMessage(t)", join_c)
    approve_b = row(0, sb).locator('[data-ciphergap-ui="group-card"] button'); approve_b.wait_for(); approve_b.click()
    pages[0].wait_for_function('testSent.some(t=>t.startsWith("cg-group-key|"))')
    key_b = pages[0].evaluate('testSent.findLast(t=>t.startsWith("cg-group-key|"))')
    # Everyone sees the key message; only B opens it.
    for i in (1, 2): pages[i].evaluate("t=>addMessage(t)", key_b)
    pages[1].wait_for_function(f"1", timeout=1000)
    stored_b = worker.evaluate("""async k=>{for(let i=0;i<200;i++){const s=await chrome.storage.local.get(k);if(s[k])return s[k];await new Promise(r=>setTimeout(r,25))}return null}""", keys[1])
    assert stored_b and stored_b.startswith("cgfs1:"), stored_b
    assert worker.evaluate("k=>chrome.storage.local.get(k).then(s=>s[k]||null)", keys[2]) is None, "member C must not get the key"
    print("PASS invite, join, approve; only the approved member receives the key")

    # Group messages: creator -> B decrypts; C (not approved) cannot.
    pages[0].locator("[contenteditable=true]").fill("hello group"); pages[0].locator("#ciphergap-btn").click()
    pages[0].wait_for_function('!document.getElementById("ciphergap-btn").disabled')
    packet = pages[0].evaluate("testSent.at(-1)"); assert packet.startswith("CGP|2|")
    rb = row(1, pages[1].evaluate("t=>addMessage(t)", packet)); rb.locator(".ciphergap-decrypt-button").click(); rb.locator(".ciphergap-plaintext").wait_for()
    assert rb.locator(".ciphergap-plaintext").inner_text() == "hello group"
    # B replies, creator reads it.
    pages[1].locator("[contenteditable=true]").fill("hi from B"); pages[1].locator("#ciphergap-btn").click()
    pages[1].wait_for_function('!document.getElementById("ciphergap-btn").disabled')
    reply = pages[1].evaluate("testSent.at(-1)")
    rc = row(0, pages[0].evaluate("t=>addMessage(t)", reply)); rc.locator(".ciphergap-decrypt-button").click(); rc.locator(".ciphergap-plaintext").wait_for()
    assert rc.locator(".ciphergap-plaintext").inner_text() == "hi from B"
    print("PASS group messages decrypt for members in both directions")

    # Wrong-recipient safety: C approving later still works; replayed key to B is harmless.
    sc_btn = row(0, sc).locator('[data-ciphergap-ui="group-card"] button'); sc_btn.click()
    pages[0].wait_for_function('testSent.filter(t=>t.startsWith("cg-group-key|")).length===2')
    key_c = pages[0].evaluate('testSent.findLast(t=>t.startsWith("cg-group-key|"))'); pages[2].evaluate("t=>addMessage(t)", key_c)
    stored_c = worker.evaluate("""async k=>{for(let i=0;i<200;i++){const s=await chrome.storage.local.get(k);if(s[k])return s[k];await new Promise(r=>setTimeout(r,25))}return null}""", keys[2])
    assert stored_c and stored_c.startswith("cgfs1:")
    rc2 = row(2, pages[2].evaluate("t=>addMessage(t)", packet)); rc2.locator(".ciphergap-decrypt-button").click(); rc2.locator(".ciphergap-plaintext").wait_for()
    assert rc2.locator(".ciphergap-plaintext").inner_text() == "hello group"
    print("PASS second member approved later reads the same group")

    # --- Removal: creator removes C; B follows the new key, C cannot read new messages, old ones still open for B.
    import json
    members = json.loads(worker.evaluate("k=>chrome.storage.local.get(k).then(s=>s[k])", keys[0] + "__members"))
    assert members["role"] == "creator" and len(members["members"]) == 2, members
    fp_c = pages[2].evaluate('testSent.findLast(t=>t.startsWith("cg-group-join|"))')
    fp_c = worker.evaluate("""async ([k,pub])=>{const e=CipherGapShared?.ecdh;return null}""", [keys[0], fp_c]) if False else None
    ids_fp = list(members["members"].keys())
    # find which fingerprint belongs to C by matching the join message's public key
    pub_c = fp_c_pub = pages[2].evaluate('testSent.findLast(t=>t.startsWith("cg-group-join|"))').split("|")[2]
    remove_fp = next(fp for fp, m in members["members"].items() if m["publicKeyB64"] == pub_c)
    old_message = packet                                           # sent before the rotation
    before_b = worker.evaluate("k=>chrome.storage.local.get(k).then(s=>s[k])", keys[1])
    r = action(0, {"action": "remove_group_member", "fingerprint": remove_fp}); assert r["ok"], r
    pages[0].wait_for_function('testSent.some(t=>t.startsWith("cg-group-rekey|"))')
    rekeys = pages[0].evaluate('testSent.filter(t=>t.startsWith("cg-group-rekey|"))'); assert len(rekeys) == 1, rekeys   # only B remains
    for i in (1, 2): pages[i].evaluate("t=>addMessage(t)", rekeys[0])
    after_b = worker.evaluate("""async ([k,old])=>{for(let i=0;i<200;i++){const s=await chrome.storage.local.get(k);if(s[k]&&s[k]!==old)return s[k];await new Promise(r=>setTimeout(r,25))}return null}""", [keys[1], before_b])
    assert after_b and after_b != before_b, "member B must switch to the new key"
    assert worker.evaluate("k=>chrome.storage.local.get(k).then(s=>s[k])", keys[2]) == stored_c, "removed member keeps its old key"
    pages[0].locator("[contenteditable=true]").fill("after removal"); pages[0].locator("#ciphergap-btn").click()
    pages[0].wait_for_function('!document.getElementById("ciphergap-btn").disabled')
    fresh = pages[0].evaluate("testSent.at(-1)"); assert fresh.startswith("CGP|2|")
    rb = row(1, pages[1].evaluate("t=>addMessage(t)", fresh)); rb.locator(".ciphergap-decrypt-button").click(); rb.locator(".ciphergap-plaintext").wait_for()
    assert rb.locator(".ciphergap-plaintext").inner_text() == "after removal"
    rc = row(2, pages[2].evaluate("t=>addMessage(t)", fresh)); rc.locator(".ciphergap-decrypt-button").click(); pages[2].wait_for_timeout(1500)
    assert rc.locator(".ciphergap-plaintext").count() == 0, "removed member must not read new messages"
    ro = row(1, pages[1].evaluate("t=>addMessage(t)", old_message)); ro.locator(".ciphergap-decrypt-button").click(); ro.locator(".ciphergap-plaintext").wait_for()
    assert ro.locator(".ciphergap-plaintext").inner_text() == "hello group", "older messages still open after rotation"
    print("PASS remove member: new key reaches the others, removed member locked out, old messages still readable")
    assert not errors, errors
    ctx.close()
