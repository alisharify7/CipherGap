"""Run real Chromium extension against Rubika/Soroush native DOM contracts."""
from pathlib import Path
import tempfile,shutil
from playwright.sync_api import sync_playwright
from new_messenger_fixtures import html
root=Path(__file__).resolve().parents[1]
profile=tempfile.mkdtemp(prefix='cg-new-messengers-')
try:
 with sync_playwright() as p:
  ctx=p.chromium.launch_persistent_context(profile,channel='chromium',headless=True,args=[f'--disable-extensions-except={root}/CipherGap',f'--load-extension={root}/CipherGap'],accept_downloads=True)
  worker=next((w for w in ctx.service_workers if w.url.startswith('chrome-extension://')),None) or ctx.wait_for_event('serviceworker')
  kernel=ctx.new_page();kernel.goto(worker.url.rsplit('/',1)[0]+'/popup/popup.html')
  kernel.evaluate('''async()=>{for(const f of ['encoding','crypto','file_crypto','dh_crypto'])await new Promise(r=>{const s=document.createElement('script');s.src='../share/'+f+'.js';s.onload=r;document.head.append(s)})}''')
  for platform,base in [('rubika','https://web.rubika.ir/'),('splus','https://web.splus.ir/')]:
   ctx.route(base+'**',lambda route,request,name=platform:route.fulfill(body=html(name),content_type='text/html'))
   pages=[];errors=[]
   for uid in [601,602]:
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+('#c=u'+str(uid) if platform=='rubika' else '#'+str(uid)));page.wait_for_selector('#ciphergap-toolbar');pages.append(page)
   tabs=worker.evaluate('base=>chrome.tabs.query({url:base+"*"}).then(t=>t.map(x=>x.id))',base)
   contexts=[worker.evaluate('id=>chrome.tabs.sendMessage(id,{action:"get_chat_context"})',t) for t in tabs]
   assert all(c['ok'] and c['messenger']==platform for c in contexts),contexts
   def action(i,message):return worker.evaluate('([id,m])=>chrome.tabs.sendMessage(id,m)',[tabs[i],dict(message,expectedStorageKey=contexts[i]['storageKey'])])
   def row(page,sid):return page.locator('#message'+sid if platform=='splus' else '[data-msg-id="'+sid+'"] [rb-message-item]')
   # Native events, two independent chat keys, inline acceptance and SAS.
   started=action(0,{'action':'start_key_exchange'});assert started['ok'],(started,pages[0].evaluate('()=>({editor:document.querySelector("[contenteditable=true]").innerText,labels:[...document.querySelectorAll("button[aria-label]")].map(e=>e.getAttribute("aria-label")),sent:testSent})'))
   pages[1].evaluate('text=>addMessage(text)',pages[0].evaluate('testSent.at(-1)'))
   pages[1].locator('[data-ciphergap-exchange-action=accept]').click();pages[1].wait_for_function('testSent.some(t=>t.startsWith("start exchange ack:"))')
   pages[0].evaluate('text=>addMessage(text)',pages[1].evaluate('testSent.find(t=>t.startsWith("start exchange ack:"))'))
   pages[0].wait_for_function('testSent.some(t=>t.startsWith("cg-sas|"))')
   keys=[c['storageKey'] for c in contexts]
   stored=worker.evaluate('async keys=>{for(let i=0;i<100;i++){const s=await chrome.storage.local.get(keys);if(keys.every(k=>s[k]))return s;await new Promise(r=>setTimeout(r,25))}throw Error("Keys not saved")}',keys)
   assert stored[keys[0]]==stored[keys[1]]
   for i in [0,1]:assert action(i,{'action':'mark_key_verified','nonce':started['nonce']})['ok']
   message='سلام 👨‍👩‍👧‍👦 👍🏽 — '+platform;pages[0].locator('[contenteditable=true]').fill(message);pages[0].locator('#ciphergap-btn').click();pages[0].wait_for_function('!document.getElementById("ciphergap-btn").disabled')
   packet=pages[0].evaluate('testSent.at(-1)');assert packet.startswith('CGP|') and message not in packet
   sid=pages[1].evaluate('t=>addMessage(t)',packet);r=row(pages[1],sid);r.locator('.ciphergap-decrypt-button').click();r.locator('.ciphergap-plaintext').wait_for();assert r.locator('.ciphergap-plaintext').inner_text()==message
   # Toolbar matches the actual native text-editor surface at both widths.
   for width in [1280,390]:
    pages[0].bring_to_front();pages[0].set_viewport_size({'width':width,'height':800});pages[0].wait_for_function('sel=>Math.abs(document.getElementById("ciphergap-toolbar").getBoundingClientRect().width-document.querySelector(sel).getBoundingClientRect().width)<1',arg='[text-editor]' if platform=='rubika' else '#native-compose-bubble')
    bounds=pages[0].locator('#ciphergap-toolbar').bounding_box();anchor=pages[0].locator('[text-editor]' if platform=='rubika' else '#native-compose-bubble').bounding_box()
    assert abs(bounds['x']-anchor['x'])<1 and abs(bounds['width']-anchor['width'])<1,(bounds,anchor)
   assert not pages[0].evaluate('Boolean(window.CipherGapShared)')
   # Native file selection receives ciphertext; receiving previews exact bytes.
   original=b'private attachment bytes'
   with pages[0].expect_file_chooser() as chooser:pages[0].locator('#ciphergap-secure-files').click()
   chooser.value.set_files({'name':'private.txt','mimeType':'text/plain','buffer':original})
   pages[0].wait_for_function('received.length===1');upload=pages[0].evaluate('received[0]');assert upload['name']=='private.txt.cgpe' and original not in bytes(upload['bytes'])
   sid=pages[1].evaluate('f=>addAttachment(f.bytes,f.name.slice(0,-5))',upload);r=row(pages[1],sid);r.locator('.ciphergap-file-decrypt-button').click();viewer=pages[1].locator('dialog[data-ciphergap-ui=file-viewer]');viewer.wait_for()
   with pages[1].expect_download() as download:viewer.locator('.ciphergap-file-viewer__download').click()
   assert download.value.suggested_filename=='private.txt' and Path(download.value.path()).read_bytes()==original
   viewer.locator('header button').click()
   pages[1].locator('#ciphergap-chat-toggle').click();pages[1].wait_for_selector('#ciphergap-secure-files[disabled]');assert r.locator('.ciphergap-file-decrypt-button').count()==0
   pages[1].locator('#ciphergap-chat-toggle').click();pages[1].wait_for_selector('#ciphergap-secure-files:not([disabled])')
   # Expired requests cannot be accepted; old keys stay intact.
   expired=kernel.evaluate('''async()=>{const s=await CipherGapShared.ecdh.create_dh_session();return CipherGapShared.protocol.build_start_exchange_message(s.nonce,s.publicKeyB64,s.codecId,Date.now()+2500)}''')
   sid=pages[1].evaluate('t=>addMessage(t)',expired);r=row(pages[1],sid);r.locator('[data-ciphergap-exchange-action=accept]').wait_for();r.locator('.ciphergap-chat-card--expired').wait_for(timeout=10000);assert not r.locator('.ciphergap-chat-card__actions').is_visible()
   assert worker.evaluate('key=>chrome.storage.local.get(key)',keys[1])[keys[1]]==stored[keys[1]]
   assert not errors,errors
   print('PASS',platform,'two-party ECDH/SAS, inline acceptance/expiry, native encrypted text/emoji/files, exact download, aligned desktop/mobile toolbar, isolated kernel and pause/resume',flush=True)
   for page in pages:page.close()
  ctx.close()
finally:shutil.rmtree(profile,ignore_errors=True)
