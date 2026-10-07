"""Run: python3 tests/browser_website.py [URL]. Uses installed Playwright."""
from pathlib import Path
import sys
import hashlib
import json
import zipfile
from io import BytesIO
from urllib.parse import urljoin, urlsplit
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8769/'
out = Path('dist/website-validation');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(permissions=['clipboard-read','clipboard-write'])
    page = context.new_page();errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(url);assert page.locator('html').get_attribute('lang')=='fa'
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
        page.locator('.screenshot-open').first.click()
        assert page.locator('#screenshot-dialog').is_visible()
        assert page.locator('#screenshot-dialog img').get_attribute('src').endswith(f'-{lang}.png')
        page.keyboard.press('Escape');assert not page.locator('#screenshot-dialog').is_visible()
        assert page.locator('.screenshot-open').first.evaluate('e=>e===document.activeElement')
        page.locator('.screenshot-open').last.click();page.locator('#screenshot-close').click()
        assert not page.locator('#screenshot-dialog').is_visible()
        assert page.locator('#faq details').count()==12
        for detail in page.locator('#faq details').all():
            detail.locator('summary').click();assert detail.locator('p').is_visible()
            detail.locator('summary').click()
        page.locator('#screenshots').scroll_into_view_if_needed()
        page.wait_for_function('Array.from(document.querySelectorAll("img[data-shot]")).every(i=>i.complete && i.naturalWidth>0)')
        assert all(img.get_attribute('src').endswith(f'-{lang}.png') for img in page.locator('img[data-shot]').all())
        for width in [1440,390,320]:
            page.set_viewport_size({'width':width,'height':900})
            page.evaluate('window.scrollTo({top:0,behavior:"instant"})')
            page.screenshot(path=str(out/f'hero-{lang}-{width}.png'))
            if width==1440:page.screenshot(path=str(out/f'page-{lang}.png'),full_page=True)
        page.reload();assert page.locator('html').get_attribute('lang')==lang
        assert page.locator('#tab-chrome').get_attribute('aria-selected')=='true'
        page.evaluate('document.fonts.ready')
        assert page.evaluate('document.fonts.check("14px Inter") && document.fonts.check("14px Vazirmatn")')
        if lang=='en':
            assert page.evaluate('''()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())if(!n.parentElement.closest('script,style,option')&&/[\\u0600-\\u06ff]/.test(n.nodeValue))return false;return true}''')
    assert page.locator('a[href="https://www.coffeete.ir/alisharify7"]').count()==2
    for attr in ['href','src']:
        for path in set(page.locator(f'[{attr}]').evaluate_all(f'es=>es.map(e=>e.getAttribute("{attr}"))')):
            if not path:continue
            if path.startswith('#'):
                assert page.locator(path).count()==1,path
            elif not urlsplit(path).scheme:
                response=context.request.get(urljoin(url,path));assert response.ok,(path,response.status)
    provenance=context.request.get(urljoin(url,'website/screenshots/provenance.json')).json()
    assert provenance['desktop_version']=='1.7.0' and provenance['android_version']=='0.1.3'
    assert len(provenance['screenshots'])==12
    for name,digest in provenance['screenshots'].items():
        response=context.request.get(urljoin(url,'website/screenshots/'+name))
        assert hashlib.sha256(response.body()).hexdigest()==digest,name
    downloads=context.request.get(urljoin(url,'website/downloads/provenance.json')).json()
    checksums=context.request.get(urljoin(url,'website/downloads/checksums.txt')).text()
    for name,digest in downloads['files'].items():
        assert f'{digest}  {name}' in checksums
        response=context.request.get(urljoin(url,'website/downloads/'+name));assert response.ok,name
        assert hashlib.sha256(response.body()).hexdigest()==digest,name
        with zipfile.ZipFile(BytesIO(response.body())) as archive:
            if name.endswith('.zip'):
                manifest=json.loads(archive.read('manifest.json'));assert manifest['version']=='1.7.0'
                if 'firefox' in name:
                    assert manifest['background'].get('scripts') and not manifest['background'].get('service_worker')
                else:assert manifest['background'].get('service_worker')
            else:
                if '-debug' in name:assert digest==provenance['apk_sha256']
                else:assert downloads['android_build'].startswith('signed release APK')
                assert 'assets/extension/share/key_transfer.js' in archive.namelist()
    apk=page.locator('.apk-download').get_attribute('href')
    assert apk=='website/downloads/ciphergap-android-0.1.3.apk'
    android=browser.new_context(user_agent='Mozilla/5.0 (Linux; Android 16) Chrome/147.0.0.0 Mobile Safari/537.36', viewport={'width':390,'height':844})
    mobile=android.new_page();mobile.goto(url)
    assert mobile.locator('#tab-android').get_attribute('aria-selected')=='true'
    mobile.locator('.menu-button').click();assert mobile.locator('#main-nav').is_visible()
    mobile.keyboard.press('Escape');assert not mobile.locator('#main-nav').is_visible()
    firefox=browser.new_context(user_agent='Mozilla/5.0 Firefox/153.0')
    firefoxpage=firefox.new_page();firefoxpage.goto(url)
    assert firefoxpage.locator('#tab-firefox').get_attribute('aria-selected')=='true'
    assert not errors,errors
    mobile.locator('.screenshot-open').first.click()
    mobile.locator('#screenshot-close').click();assert not mobile.locator('#screenshot-dialog').is_visible()
    browser.close()
print('PASS website: EN/FA, 320/390/1440 px, four platform guides, keyboard, persistence, clipboard, fonts, Android/Firefox detection, mobile menu, screenshots/dialog, FAQ, links and verified downloads')
