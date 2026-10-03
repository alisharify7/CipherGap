from pathlib import Path
import tempfile,json,shutil
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];extension=root/'CipherGap'
fixture='''<!doctype html><html><body><div id="message_list_scroller_id"></div><footer id="chat_footer"><input type="file"><div id="editable-message-text" contenteditable="true"></div><div><button aria-label="send-button">Send</button></div></footer><script>window.received=[];document.querySelector('input[type=file]').addEventListener('change', async event=>{for(const file of event.target.files){received.push({name:file.name,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))});}});window.testSent=[];document.querySelector('[aria-label="send-button"]').onclick=()=>{testSent.push(document.getElementById('editable-message-text').textContent);document.getElementById('editable-message-text').textContent='';};</script></body></html>'''
profile=Path(tempfile.mkdtemp(prefix='cg-check-'))
with sync_playwright() as p:
 context=p.chromium.launch_persistent_context(str(profile),channel='chromium',headless=True,args=[f'--disable-extensions-except={extension}',f'--load-extension={extension}'],viewport={'width':440,'height':760})
 context.route('https://web.bale.ai/**',lambda route:route.fulfill(body=fixture,content_type='text/html'))
 errors=[]
 context.on('page',lambda page:page.on('pageerror',lambda error:errors.append(str(error))))
 worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker');id=worker.url.split('/')[2]
 worker.evaluate("chrome.storage.local.set({'web.bale.ai_601':'fixture-long-shared-key','ciphergap_ui_language':'en'})")
 page=context.new_page();page.goto('https://web.bale.ai/chat?uid=601');page.wait_for_selector('#ciphergap-secure-files:not([disabled])')
 native=page.locator('#chat_footer input[type=file]');native.set_input_files({'name':'plain.txt','mimeType':'text/plain','buffer':b'plain bytes'})
 page.wait_for_function('received.length===1');assert page.evaluate('received[0]')=={'name':'plain.txt','bytes':list(b'plain bytes')}
 with page.expect_file_chooser() as chooser:page.locator('#ciphergap-secure-files').click()
 chooser.value.set_files({'name':'private.txt','mimeType':'text/plain','buffer':b'private bytes'})
 page.wait_for_function('received.length===2');secure=page.evaluate('received[1]');assert secure['name']=='private.txt.cgpe';assert bytes(secure['bytes']).startswith(b'CGPE');assert b'private bytes' not in bytes(secure['bytes'])
 # Stop while a secure picker is open. Never deliver its original bytes.
 with page.expect_file_chooser() as chooser:page.locator('#ciphergap-secure-files').click()
 worker.evaluate("chrome.storage.local.set({'ciphergap_enabled':false})");page.wait_for_selector('#ciphergap-secure-files[disabled]')
 chooser.value.set_files({'name':'blocked.txt','mimeType':'text/plain','buffer':b'secret'})
 page.wait_for_function("document.getElementById('ciphergap-live-notice')?.textContent.includes('not sent')")
 assert page.evaluate('received.length')==2
 assert not page.locator('#ciphergap-btn').is_visible()
 worker.evaluate("chrome.storage.local.set({'ciphergap_enabled':true})");page.wait_for_selector('#ciphergap-secure-files:not([disabled])')
 page.locator('#ciphergap-chat-toggle').click();page.wait_for_selector('#ciphergap-secure-files[disabled]');assert not page.locator('#ciphergap-btn').is_visible()
 page.locator('#ciphergap-chat-toggle').click();page.wait_for_selector('#ciphergap-secure-files:not([disabled])')
 print('PASS explicit ordinary/encrypted files, pause during selection, global and per-chat resume')
 popup=context.new_page();popup.goto(f'chrome-extension://{id}/popup/popup.html?tabId='+str(worker.evaluate("chrome.tabs.query({url:'https://web.bale.ai/*'}).then(t=>t[0].id)")))
 popup.wait_for_selector('#languageSelect');popup.locator('#languageSelect').select_option('fa');popup.wait_for_function('document.documentElement.lang==="fa"')
 assert 'امنیت' in popup.locator('#nav-security').inner_text();popup.locator('#nav-settings').click();assert 'فعال بودن' in popup.locator('#page-settings').inner_text()
 popup.evaluate('document.fonts.ready');assert popup.evaluate('document.fonts.check("14px Vazirmatn")')
 popup.screenshot(path='/tmp/ciphergap-popup-fa.png',full_page=True)
 remaining=popup.evaluate("[...document.querySelectorAll('p,h2,h3,button,span')].filter(e=>!e.children.length && /[A-Za-z]{4}/.test(e.textContent) && !/CipherGap|Ali Sharify|Bale|100 MB|100|cgpe/.test(e.textContent)).map(e=>e.textContent.trim()).filter(Boolean)")
 print('FA remaining',json.dumps(remaining,ensure_ascii=False))
 popup.locator('#languageSelect').select_option('en');popup.wait_for_function('document.documentElement.lang==="en"');assert 'Security' in popup.locator('#nav-security').inner_text()
 popup.screenshot(path='/tmp/ciphergap-popup-en.png',full_page=True)
 assert not errors,errors
 print('PASS actual popup localization, RTL/LTR, fonts and English restore')
 context.close()
shutil.rmtree(profile,ignore_errors=True)
