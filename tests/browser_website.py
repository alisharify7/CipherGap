"""Run: python3 tests/browser_website.py [URL]. Uses installed Playwright."""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8769/'
out = Path('dist/website-validation');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(permissions=['clipboard-read','clipboard-write'])
    page = context.new_page();errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(url);assert page.locator('html').get_attribute('lang')=='en'
    for lang in ['en','fa']:
        page.select_option('#language-select',lang)
        assert page.locator('html').get_attribute('dir')==('rtl' if lang=='fa' else 'ltr')
        for width in [1440,390,320]:
            page.set_viewport_size({'width':width,'height':900})
            for platform in ['android','chrome','firefox','chromium']:
                page.locator('#tab-'+platform).click()
                assert page.locator('[role=tabpanel]:visible').count()==1
                assert page.locator('#install-'+platform).is_visible()
                assert page.locator('[role=tab][tabindex="0"]').count()==1
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(lang,width,platform)
            page.locator('#tab-android').click()
            page.locator('#install-android summary').click()
            assert page.locator('#install-android details').get_attribute('open') is not None
            page.locator('#install-android summary').click()
            if width!=320:page.locator('#installation').screenshot(path=str(out/f'install-{lang}-{width}.png'))
        page.locator('#tab-android').focus();page.keyboard.press('End')
        assert page.locator('#tab-chromium').get_attribute('aria-selected')=='true'
        page.keyboard.press('Home');page.keyboard.press('ArrowLeft' if lang=='fa' else 'ArrowRight')
        assert page.locator('#tab-chrome').get_attribute('aria-selected')=='true'
        page.locator('#install-chrome [data-copy]').click()
        page.wait_for_function('!document.getElementById("copy-status").hidden')
        assert page.evaluate('navigator.clipboard.readText()')=='chrome://extensions'
        page.reload();assert page.locator('html').get_attribute('lang')==lang
        assert page.locator('#tab-chrome').get_attribute('aria-selected')=='true'
        page.evaluate('document.fonts.ready')
        assert page.evaluate('document.fonts.check("14px Inter") && document.fonts.check("14px Vazirmatn")')
        if lang=='en':
            assert page.evaluate('''()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())if(!n.parentElement.closest('script,style,option')&&/[\\u0600-\\u06ff]/.test(n.nodeValue))return false;return true}''')
    assert page.locator('a[href="https://www.coffeete.ir/alisharify7"]').count()==2
    apk=page.locator('.apk-download').get_attribute('href')
    assert apk.startswith('https://github.com/alisharify7/CipherGap/releases/download/android-') and apk.endswith('.apk')
    android=browser.new_context(user_agent='Mozilla/5.0 (Linux; Android 16) Chrome/147.0.0.0 Mobile Safari/537.36', viewport={'width':390,'height':844})
    mobile=android.new_page();mobile.goto(url)
    assert mobile.locator('#tab-android').get_attribute('aria-selected')=='true'
    mobile.locator('.menu-button').click();assert mobile.locator('#main-nav').is_visible()
    mobile.keyboard.press('Escape');assert not mobile.locator('#main-nav').is_visible()
    firefox=browser.new_context(user_agent='Mozilla/5.0 Firefox/153.0')
    firefoxpage=firefox.new_page();firefoxpage.goto(url)
    assert firefoxpage.locator('#tab-firefox').get_attribute('aria-selected')=='true'
    assert not errors,errors
    browser.close()
print('PASS website: EN/FA, 320/390/1440 px, four platform guides, keyboard, persistence, clipboard, fonts, Android/Firefox detection, mobile menu')
