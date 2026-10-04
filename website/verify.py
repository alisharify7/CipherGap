"""Browser smoke checks for the static site (requires Playwright)."""
import functools
import http.server
import os
from pathlib import Path
import shutil
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def translate_path(self, path):
        return super().translate_path(path.removeprefix("/CipherGap"))


server = http.server.ThreadingHTTPServer(
    ("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT))
)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}"
try:
    with sync_playwright() as playwright:
        executable = os.environ.get("CHROMIUM_BINARY") or shutil.which("google-chrome")
        browser = playwright.chromium.launch(executable_path=executable, headless=True)
        for width, height in [(1440, 1000), (1280, 800), (768, 1024), (390, 844), (320, 700)]:
            page = browser.new_page(viewport={"width": width, "height": height})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("response", lambda response: errors.append(response.url) if response.status >= 400 else None)
            page.goto(url + "/CipherGap/")
            assert page.locator("html").get_attribute("lang") == "en"
            assert page.locator("#language-select").input_value() == "en"
            remaining=page.evaluate("""(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),out=[];let n;while(n=w.nextNode()){if(!n.parentElement.closest('script,style,option,noscript') && /[\u0600-\u06ff]/.test(n.nodeValue))out.push(n.nodeValue.trim());}return out;})()""")
            assert not remaining, remaining
            assert page.locator(".site-footer p").inner_text() == "Ali Sharify · Open source"
            assert page.locator(".messengers .available strong").inner_text() == "Bale"
            assert page.locator(".messengers li:not(.available) small").all_inner_texts() == ["In development"] * 4
            assert page.locator(".messenger-logo").count() == 5
            page.locator("#guide").scroll_into_view_if_needed()
            page.wait_for_function("[...document.images].every(image => image.complete && image.naturalWidth > 0)")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (width, page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,items:[...document.querySelectorAll(\"body *\")].filter(e=>e.getBoundingClientRect().x<-1||e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right}))})"))
            page.locator("#tab-firefox").click()
            assert page.locator("#install-firefox").is_visible()
            assert not page.locator("#install-chrome").is_visible()
            page.locator("#tab-firefox").focus()
            page.keyboard.press("Home")
            assert page.locator("#tab-chrome").get_attribute("aria-selected") == "true"
            page.locator(".faq-list summary").first.click()
            assert page.locator(".faq-list details").first.get_attribute("open") is not None
            if width < 720:
                page.locator(".menu-button").click()
                assert page.locator("#main-nav").is_visible()
                page.keyboard.press("Escape")
                assert not page.locator("#main-nav").is_visible()
                page.locator(".menu-button").click()
                page.locator('#main-nav a[href="#guide"]').click()
                assert page.locator(".menu-button").get_attribute("aria-expanded") == "false"
            page.locator("#language-select").select_option("en")
            assert page.locator("html").get_attribute("dir") == "ltr"
            assert page.locator("#hero-title").inner_text() == "Same chat.\nMore privacy."
            page.evaluate("document.fonts.ready")
            assert page.evaluate("document.fonts.check('14px Inter')")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (width, "English overflow")
            page.reload()
            assert page.locator("html").get_attribute("lang") == "en"
            page.locator("#language-select").select_option("fa")
            assert page.locator("html").get_attribute("dir") == "rtl"
            assert "Ali Sharify" in page.locator(".site-footer p").inner_text()
            assert "علی شریفی" not in page.locator(".site-footer p").inner_text()
            assert page.locator(".messengers li:not(.available) small").all_inner_texts() == ["در دست توسعه"] * 4
            page.reload()
            assert page.locator("html").get_attribute("lang") == "fa"
            assert page.evaluate("document.fonts.check('14px Vazirmatn')")
            assert not errors, errors
            page.evaluate("scrollTo(0, 0)")
            page.emulate_media(reduced_motion="reduce")
            page.evaluate("document.documentElement.style.scrollBehavior='auto'; scrollTo(0,0)")
            if width in [1440, 390]:
                page.screenshot(path=str(ROOT / "website" / f"preview-{width}.png"))
            print(f"PASS: {width}px, subpath assets, navigation, tabs and FAQ")
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
