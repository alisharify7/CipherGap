from pathlib import Path
import tempfile,json,shutil
from playwright.sync_api import sync_playwright
from browser_fixtures import media_fixtures, ATTACHMENT_JS, ENCRYPT_JS
root=Path(__file__).resolve().parents[1];extension=root/'CipherGap'
fixture='''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}#message_list_scroller_id{height:calc(100dvh - 80px);overflow:auto}#chat_footer{position:fixed;bottom:12px;left:12px;right:12px}#chat_footer [aria-label=message-composer]{display:flex;align-items:center;gap:8px;padding:12px;background:white;border-radius:16px}#editable-message-text{flex:1;min-width:0;min-height:24px}#chat_footer input[type=file]{display:none}</style></head><body><div id="message_list_scroller_id"></div><footer id="chat_footer"><div aria-label="message-composer"><input type="file"><div id="editable-message-text" contenteditable="true"></div><div><button aria-label="send-button">Send</button></div></div></footer><script>window.received=[];document.querySelector('input[type=file]').addEventListener('change', async event=>{for(const file of event.target.files){received.push({name:file.name,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))});}});window.testSent=[];document.querySelector('[aria-label="send-button"]').onclick=()=>{testSent.push(document.getElementById('editable-message-text').textContent);document.getElementById('editable-message-text').textContent='';};</script></body></html>'''
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
 # The toolbar lives outside React's composer and follows its native width.
 assert page.locator('body > #ciphergap-toolbar #ciphergap-btn').count()==1
 for width in [320,390,1280]:
  page.set_viewport_size({'width':width,'height':760});page.wait_for_timeout(180)
  geometry=page.evaluate("""()=>{const t=document.getElementById('ciphergap-toolbar').getBoundingClientRect(),c=document.querySelector('[aria-label=message-composer]').getBoundingClientRect();return {x:Math.abs(t.x-c.x),w:Math.abs(t.width-c.width),above:t.bottom<c.top,inside:t.left>=0&&t.right<=innerWidth};}""")
  assert geometry['x']<1 and geometry['w']<1 and geometry['above'] and geometry['inside'],geometry
 page.set_viewport_size({'width':440,'height':760})
 print('PASS Bale separate send controls and aligned 320/390/1280 px toolbar')
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
 # The sent wire message includes the notice; enabled readers hide it even
 # before manual decryption and when Bale renders its URL as a separate link.
 page.locator('#editable-message-text').fill('سلام — notice round trip')
 page.locator('#ciphergap-btn').click();page.wait_for_function('testSent.length===1')
 packet=page.evaluate('testSent[0]');notice=packet.split('\n\n',1)[1]
 assert 'https://github.com/alisharify7/CipherGap' in notice
 assert notice.endswith('https://alisharify7.github.io/CipherGap/')
 page.evaluate('''([packet,notice])=>{
   const core=packet.split('\\n\\n')[0],scroller=document.getElementById('message_list_scroller_id');
   for(const mode of ['single','split','nested']){
     const row=document.createElement('div');row.dataset.sid='notice-'+mode;row.setAttribute('aria-label','message-item');
     const body=document.createElement('div');row.append(body);
     if(mode==='single'){const p=document.createElement('p');p.textContent=packet;body.append(p);}
     else {const p=document.createElement('p');p.textContent=core;if(mode==='nested'){const span=document.createElement('span');span.textContent=core;p.replaceChildren(span);}body.append(p);
       const hint=document.createElement('p');hint.textContent=notice.split('\\n')[0];body.append(hint);
       for(const url of notice.split('\\n').slice(1)){const a=document.createElement('a');a.href=url;a.textContent=a.href;body.append(a);}
       const time=document.createElement('small');time.textContent='12:34';body.append(time);}
     scroller.append(row);
   }
   const ordinary=document.createElement('div');ordinary.dataset.sid='notice-ordinary';ordinary.setAttribute('aria-label','message-item');const p=document.createElement('p');p.textContent=notice;ordinary.append(p);scroller.append(ordinary);
 }''',[packet,notice])
 page.wait_for_function('document.querySelectorAll("[data-ciphergap-message-notice][hidden]").length===3')
 for mode in ['single','split','nested']:
  row=page.locator(f'[data-sid="notice-{mode}"]');assert notice.split('\n')[0] not in row.inner_text();assert row.locator('.ciphergap-decrypt-button').count()==1
 assert notice.split('\n')[0] in page.locator('[data-sid="notice-ordinary"]').inner_text()
 page.locator('[data-sid="notice-single"] .ciphergap-decrypt-button').click()
 page.wait_for_function('document.querySelector("[data-sid=notice-single]").dataset.ciphergapDecrypted==="true"')
 assert 'سلام — notice round trip' in page.locator('[data-sid="notice-single"]').inner_text()
 assert notice.split('\n')[0] not in page.locator('[data-sid="notice-single"]').inner_text()
 page.locator('#ciphergap-chat-toggle').click();page.wait_for_function('document.querySelectorAll("[data-ciphergap-message-notice][hidden]").length===0')
 for mode in ['single','split','nested']:assert notice.split('\n')[0] in page.locator(f'[data-sid="notice-{mode}"]').inner_text()
 page.locator('#ciphergap-chat-toggle').click();page.wait_for_function('document.querySelectorAll("[data-ciphergap-message-notice][hidden]").length===3')
 worker.evaluate("chrome.storage.local.set({'web.bale.ai_601__auto_decrypt':true})")
 page.evaluate('''packet=>{const row=document.createElement('div');row.dataset.sid='notice-auto';row.setAttribute('aria-label','message-item');const p=document.createElement('p');p.textContent=packet;row.append(p);document.getElementById('message_list_scroller_id').append(row);}''',packet)
 page.wait_for_function('document.querySelector("[data-sid=notice-auto]").dataset.ciphergapDecrypted==="true"')
 assert notice.split('\n')[0] not in page.locator('[data-sid="notice-auto"]').inner_text()
 print('PASS notice serialization, split/nested/link rendering, manual/auto decryption, pause/resume and ordinary text')
 popup=context.new_page();popup.goto(f'chrome-extension://{id}/popup/popup.html?tabId='+str(worker.evaluate("chrome.tabs.query({url:'https://web.bale.ai/*'}).then(t=>t[0].id)")))
 popup.wait_for_selector('#languageSelect');popup.locator('#languageSelect').select_option('fa');popup.wait_for_function('document.documentElement.lang==="fa"')
 assert 'امنیت' in popup.locator('#nav-security').inner_text();popup.locator('#nav-settings').click();assert 'فعال بودن' in popup.locator('#page-settings').inner_text()
 popup.evaluate('document.fonts.ready');assert popup.evaluate('document.fonts.check("14px Vazirmatn")')
 popup.screenshot(path='/tmp/ciphergap-popup-fa.png',full_page=True)
 remaining=popup.evaluate("[...document.querySelectorAll('p,h2,h3,button,span')].filter(e=>!e.children.length && /[A-Za-z]{4}/.test(e.textContent) && !/CipherGap|Ali Sharify|Bale|100 MB|100|cgpe/.test(e.textContent)).map(e=>e.textContent.trim()).filter(Boolean)")
 print('FA remaining',json.dumps(remaining,ensure_ascii=False))
 popup.locator('#languageSelect').select_option('en');popup.wait_for_function('document.documentElement.lang==="en"');assert 'Security' in popup.locator('#nav-security').inner_text()
 popup.screenshot(path='/tmp/ciphergap-popup-en.png',full_page=True)
 # Documentation screenshots use the real extension at its native popup size.
 worker.evaluate("chrome.storage.local.set({'key_trust_web.bale.ai_601':{state:'verified',source:'exchange',nonce:'fixture',fingerprint:'84A6E5B3',at:Date.now()}})")
 popup.locator('#nav-security').click();popup.wait_for_function("document.getElementById('securityCard').dataset.view==='verified'")
 popup.screenshot(path='/tmp/ciphergap-security-1.3.png',clip={'x':0,'y':0,'width':440,'height':590})
 popup.locator('#nav-files').click();popup.screenshot(path='/tmp/ciphergap-files-1.3.png',clip={'x':0,'y':0,'width':440,'height':590})
 assert not errors,errors
 print('PASS actual popup localization, RTL/LTR, fonts and English restore')
 # Exercise actual CGPE decryption through the native bridge, then shared media UI.
 popup.evaluate("""async()=>{for(const name of ['encoding','crypto','file_crypto','dh_crypto'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='../share/'+name+'.js';s.onload=resolve;s.onerror=reject;document.head.append(s)});} """)
 for name,mime,data,kind in media_fixtures(root):
  encoded=popup.evaluate('async args=>{'+ENCRYPT_JS.replace('arguments[0]','args')+'}',[list(data),name,mime,'fixture-long-shared-key'])
  sid=page.evaluate('args=>{'+ATTACHMENT_JS.replace('arguments[0]','args')+'}',[encoded,name])
  page.locator(f'[data-sid="{sid}"] .ciphergap-file-decrypt-button').click()
  viewer=page.locator('dialog[data-ciphergap-ui="file-viewer"]');viewer.wait_for(state='visible')
  assert viewer.locator('h2').inner_text()==name
  if kind=='img':page.wait_for_function('document.querySelector(".ciphergap-file-viewer img")?.naturalWidth===128')
  elif kind in ['audio','video']:
   media=viewer.locator(kind);media.click();media.evaluate('(m)=>m.play()');page.wait_for_function('document.querySelector(".ciphergap-file-viewer audio,.ciphergap-file-viewer video")?.currentTime>0')
   if kind=='video':assert media.evaluate('(m)=>m.videoWidth')==64
  else:
   assert viewer.locator('iframe,object,embed,script').count()==0
   assert not page.evaluate('Boolean(window.unsafePreview)')
  with page.expect_download() as download:viewer.locator('.ciphergap-file-viewer__download').click()
  assert download.value.suggested_filename==name
  assert Path(download.value.path()).read_bytes()==data
  page.screenshot(path='/tmp/ciphergap-media-'+kind+'.png')
  media_url=viewer.locator('img,audio,video').first.get_attribute('src') if kind!='fallback' else None
  if kind=='img':
   worker.evaluate("chrome.storage.local.set({'ciphergap_enabled':false})")
   viewer.wait_for(state='detached')
   worker.evaluate("chrome.storage.local.set({'ciphergap_enabled':true})")
   page.wait_for_selector('#ciphergap-secure-files:not([disabled])')
  else:viewer.locator('header button').click();viewer.wait_for(state='detached')
  if media_url:assert page.evaluate('async url=>{try{await fetch(url);return false}catch{return true}}',media_url)

 print('PASS manual authenticated image/audio/video preview, actual playback, safe HTML fallback and exact downloads')
 # Countdown expires in the chat and the consent controls disappear.
 request=popup.evaluate("""async()=>{const session=await CipherGapShared.ecdh.create_dh_session();return CipherGapShared.protocol.build_start_exchange_message(session.nonce,session.publicKeyB64,session.codecId,Date.now()+4000);}""")
 page.evaluate("""text=>{const row=document.createElement('div');row.dataset.sid='expiry';row.dataset.date=String(Date.now());row.setAttribute('aria-label','message-item');row.innerHTML='<svg aria-label="LeftBubble-icon"></svg><div><p></p></div>';row.querySelector('p').textContent=text;document.getElementById('message_list_scroller_id').append(row);}""",request)
 card=page.locator('[data-sid="expiry"] [data-ciphergap-ui="protocol"]')
 card.locator('[data-ciphergap-exchange-action="accept"]').wait_for(state='visible')
 page.wait_for_function('document.querySelector("[data-sid=expiry] .ciphergap-chat-card").classList.contains("ciphergap-chat-card--expired")')
 assert card.locator('.ciphergap-chat-card__timer').inner_text()=='00:00'
 assert not card.locator('.ciphergap-chat-card__actions').is_visible()
 assert 'expired' in card.inner_text()
 page.screenshot(path='/tmp/ciphergap-expired.png')
 print('PASS visible absolute countdown, expired notice and unavailable acceptance')
 assert not errors,errors
 context.close()
shutil.rmtree(profile,ignore_errors=True)
