"""Eitaa channel history stays untouched; chat scrolling does not rewrite the toolbar."""
from pathlib import Path
import shutil
import tempfile

from playwright.sync_api import sync_playwright
from messenger_fixtures import html

root = Path(__file__).resolve().parents[1]
profile = tempfile.mkdtemp(prefix="ciphergap-eitaa-scroll-")
try:
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            profile, channel="chromium", headless=True,
            args=[f"--disable-extensions-except={root}/CipherGap", f"--load-extension={root}/CipherGap"],
        )
        ctx.route("https://web.eitaa.com/**", lambda route: route.fulfill(body=html("eitaa"), content_type="text/html"))
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("https://web.eitaa.com/#-601")
        page.wait_for_selector("#ciphergap-toolbar")
        page.evaluate("""() => {
            document.querySelector('[data-ciphergap-composer]').remove();
            window.rowMutations = [];
            new MutationObserver(records => rowMutations.push(...records.filter(r => r.target.closest('[data-mid]') && r.attributeName.startsWith('data-ciphergap-'))))
                .observe(document.getElementById('messages'), {subtree:true, attributes:true});
            for (let i = 0; i < 300; i++) {
                const id = addMessage('خبر کانال ' + i);
                document.querySelector('[data-mid="' + id + '"]').dataset.timestamp = '1';
            }
        }""")
        page.wait_for_selector("#ciphergap-toolbar", state="detached")
        page.wait_for_timeout(600)
        mutations = page.evaluate("rowMutations.length")
        assert mutations == 0, f"Ordinary channel rows were rewritten {mutations} times"
        page.evaluate("document.getElementById('messages').scrollTop = 200")
        page.wait_for_timeout(250)
        assert page.evaluate("document.getElementById('messages').scrollTop") == 200
        assert page.evaluate("rowMutations.length") == 0

        # A native row can acquire encrypted content after it was first mounted.
        page.evaluate("""() => {
            const row = document.querySelector('[data-mid]');
            row.querySelector('[dir=auto]').firstChild.textContent = 'CGP|1|AESGCM|1|testCiphertext';
        }""")
        page.wait_for_selector(".ciphergap-decrypt-button")

        page.goto("https://web.eitaa.com/#602")
        page.reload()
        page.wait_for_selector("#ciphergap-toolbar")
        page.evaluate("""() => {
            const composer = document.querySelector('[data-ciphergap-composer]');
            composer.style.position = 'fixed'; composer.style.bottom = '0';
            for (let i = 0; i < 150; i++) addMessage('پیام معمولی ' + i);
        }""")
        page.wait_for_timeout(600)
        page.evaluate("""() => {
            window.toolbarMutations = [];
            new MutationObserver(records => toolbarMutations.push(...records))
                .observe(document.getElementById('ciphergap-toolbar'), {attributes:true});
        }""")
        for top in [300, 240, 180, 120]:
            page.evaluate("top => document.getElementById('messages').scrollTop = top", top)
            page.wait_for_timeout(60)
        page.wait_for_timeout(250)
        assert page.evaluate("document.getElementById('messages').scrollTop") == 120
        mutations = page.evaluate("toolbarMutations.length")
        assert mutations == 0, f"Scrolling rewrote the stationary toolbar {mutations} times"
        assert not errors, errors
        print("PASS Eitaa channel history untouched, stable scroll/toolbar, late encrypted content detected")
        ctx.close()
finally:
    shutil.rmtree(profile, ignore_errors=True)
