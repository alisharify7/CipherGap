"""Browser smoke checks for the static site (requires Playwright + Chromium).

Serves the repository root on a free local port, then checks Persian/English,
RTL/LTR, light/dark, tabs, FAQ, menu, clipboard feedback, fonts, broken
requests, JS errors and horizontal overflow at several widths.
"""
import functools
import http.server
import os
from pathlib import Path
import shutil
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
UNTRANSLATED = """(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),o=[];let n;
while(n=w.nextNode()){if(!n.parentElement.closest('script,style,option,noscript')&&/[\\u0600-\\u06ff]/.test(n.nodeValue))o.push(n.nodeValue.trim())}return o})()"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(
    ("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT))
)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}/"
try:
    with sync_playwright() as playwright:
        executable = os.environ.get("CHROMIUM_BINARY") or shutil.which("google-chrome")
        browser = playwright.chromium.launch(executable_path=executable, headless=True)
        for width, height in [(1440, 1000), (1280, 800), (1024, 800), (768, 1024), (390, 844), (320, 700)]:
            page = browser.new_page(viewport={"width": width, "height": height})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("response", lambda r: errors.append(r.url) if r.status >= 400 else None)
            page.goto(url)
            assert page.locator("html").get_attribute("lang") == "fa"
            assert page.locator("html").get_attribute("dir") == "rtl"
            assert page.locator("#hero-title").inner_text().startswith("همان چت همیشگی")
            page.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager')")
            page.wait_for_function("[...document.images].filter(i => i.getAttribute('src')).every(i => i.complete && i.naturalWidth > 0)")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (width, "fa overflow")
            assert page.evaluate("document.fonts.check('14px Vazirmatn')")
            page.locator("#tab-firefox").click()
            assert page.locator("#install-firefox").is_visible()
            assert not page.locator("#install-chrome").is_visible()
            page.locator("#tab-firefox").focus()
            page.keyboard.press("Home")
            assert page.locator("#tab-android").get_attribute("aria-selected") == "true"
            page.locator(".faq-list summary").first.click()
            assert page.locator(".faq-list details").first.get_attribute("open") is not None
            page.locator(".theme-toggle").click()
            assert page.locator("html").get_attribute("data-theme") in ("light", "dark")
            if width <= 1100:
                page.locator(".menu-button").click()
                assert page.locator("#main-nav").is_visible()
                page.keyboard.press("Escape")
                assert not page.locator("#main-nav").is_visible()
                page.locator(".menu-button").click()
                page.locator('#main-nav a[href="#installation"]').click()
                assert page.locator(".menu-button").get_attribute("aria-expanded") == "false"
            page.locator("#language-select").select_option("en")
            assert page.locator("html").get_attribute("dir") == "ltr"
            assert page.locator("#hero-title").inner_text() == "Your usual chat.\nWith encryption."
            assert page.locator("#upcoming-title").inner_text() == "In the next release.\nNot released yet."
            assert "Secure group chats" in page.locator(".upcoming-grid").inner_text()
            assert not page.evaluate(UNTRANSLATED), page.evaluate(UNTRANSLATED)
            assert page.evaluate("document.fonts.check('14px Inter')")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (width, "en overflow")
            page.reload()
            assert page.locator("html").get_attribute("lang") == "en"
            page.locator("#language-select").select_option("fa")
            assert page.locator("html").get_attribute("dir") == "rtl"
            assert not errors, errors
            print(f"PASS: {width}px, navigation, tabs, FAQ, theme and language")
            page.close()
        page = browser.new_page()
        page.context.grant_permissions(["clipboard-read", "clipboard-write"])
        page.goto(url)
        page.locator("#language-select").select_option("fa")
        page.locator('[data-copy="chrome://extensions"]').click()
        assert page.evaluate("navigator.clipboard.readText()") == "chrome://extensions"
        page.evaluate("Object.defineProperty(navigator, 'clipboard', {value: {writeText: async () => {throw new Error('denied')}}})")
        page.locator('[data-copy="chrome://extensions"]').click()
        assert "دسترس نیست" in page.locator("#copy-status").inner_text()
        print("PASS: clipboard success and recovery feedback")
        browser.close()
finally:
    server.shutdown()
    server.server_close()
