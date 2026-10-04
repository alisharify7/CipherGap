"""Real Chrome extension against captured Eitaa/Telegram DOM contracts."""
from pathlib import Path
import tempfile,shutil
from playwright.sync_api import sync_playwright
from messenger_fixtures import html
from browser_fixtures import media_fixtures,ENCRYPT_JS
root=Path(__file__).resolve().parents[1]
profile=tempfile.mkdtemp(prefix='ciphergap-messengers-')
try:
 with sync_playwright() as pw:
  ctx=pw.chromium.launch_persistent_context(profile,channel="chromium",headless=True,args=[f'--disable-extensions-except={root}/CipherGap',f'--load-extension={root}/CipherGap'],accept_downloads=True)
  worker=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
  extension_id=worker.url.split('/')[2]
  kernel=ctx.new_page();kernel.goto(f'chrome-extension://{extension_id}/popup/popup.html')
  kernel.evaluate("""async()=>{for(const file of ['encoding','crypto','file_crypto','dh_crypto'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='../share/'+file+'.js';s.onload=resolve;s.onerror=reject;document.head.append(s)});} """)
  for platform,base in [('eitaa','https://web.eitaa.com/'),('telegram','https://web.telegram.org/a/')]:
   pages=[];errors=[]
   ctx.route(base+'**',lambda route,request,p=platform:route.fulfill(body=html(p),content_type='text/html'))
   for uid in [601,602]:
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'#'+str(uid));page.wait_for_selector('#ciphergap-toolbar');pages.append(page)
   tabs=worker.evaluate('base=>chrome.tabs.query({url:base+"*"}).then(t=>t.map(x=>x.id))',base)
   contexts=[worker.evaluate('id=>chrome.tabs.sendMessage(id,{action:"get_chat_context"})',t) for t in tabs]
   assert all(c['ok'] and c['messenger']==platform for c in contexts),contexts
   def action(i,message):
    return worker.evaluate('([id,message])=>chrome.tabs.sendMessage(id,message)',[tabs[i],dict(message,expectedStorageKey=contexts[i]['storageKey'])])
   editor='[contenteditable=true][enterkeyhint]' if platform=='eitaa' else '#editable-message-text'
   pages[0].locator(editor).fill('retain this unsent draft')
   started=action(0,{'action':'start_key_exchange'});assert started['ok'],started
   assert pages[0].locator(editor).inner_text()=='retain this unsent draft'
   request=pages[0].evaluate('testSent.at(-1)');pages[1].evaluate('s=>addMessage(s)',request)
   pages[1].locator('[data-ciphergap-exchange-action=accept]').wait_for(state='visible');pages[1].locator('[data-ciphergap-exchange-action=accept]').click()
   pages[1].wait_for_function('testSent.some(s=>s.startsWith("start exchange ack:"))')
   ack=pages[1].evaluate('testSent.find(s=>s.startsWith("start exchange ack:"))');pages[0].evaluate('s=>addMessage(s)',ack)
   keynames=[c['storageKey'] for c in contexts]
   pages[0].wait_for_function('testSent.some(s=>s.startsWith("cg-sas|"))')
   stored=worker.evaluate('async keys=>{for(let i=0;i<100;i++){const s=await chrome.storage.local.get(keys);if(s[keys[0]]&&s[keys[1]])return s;await new Promise(r=>setTimeout(r,25));}throw new Error("Peer did not persist its derived key");}',keynames+['exchange_status_'+k for k in keynames])
   assert stored[keynames[0]]==stored[keynames[1]]
   assert stored['exchange_status_'+keynames[0]]['sas']==stored['exchange_status_'+keynames[1]]['sas']
   for i in [0,1]:assert action(i,{'action':'mark_key_verified','nonce':started['nonce']})['ok']
   pages[0].locator(editor).fill('CipherGap — '+platform+' — سلام')
   pages[0].locator('#ciphergap-btn').click();pages[0].wait_for_function('!document.getElementById("ciphergap-btn").disabled')
   packet=pages[0].evaluate('testSent.at(-1)');assert packet.startswith('CGP|'),packet
   sid=pages[1].evaluate('s=>addMessage(s)',packet)
   row=pages[1].locator('[data-mid="'+sid+'"]' if platform=='eitaa' else '#message-'+sid)
   row.locator('.ciphergap-decrypt-button').click();row.locator('.ciphergap-plaintext').wait_for()
   assert row.locator('.ciphergap-plaintext').inner_text()=='CipherGap — '+platform+' — سلام'
   assert not row.locator('[data-ciphergap-message-notice]').is_visible()
   with pages[0].expect_file_chooser() as chooser:pages[0].evaluate('nativeFile.click()')
   chooser.value.set_files({'name':'ordinary.txt','mimeType':'text/plain','buffer':b'ordinary'})
   pages[0].wait_for_function('received.length===1');assert pages[0].evaluate('received[0].bytes')==list(b'ordinary')
   with pages[0].expect_file_chooser() as chooser:pages[0].locator('#ciphergap-secure-files').click()
   chooser.value.set_files({'name':'private.txt','mimeType':'text/plain','buffer':b'private'})
   pages[0].wait_for_function('received.length===2');selected=pages[0].evaluate('received[1]')
   assert selected['name']=='private.txt.cgpe' and bytes(selected['bytes']).startswith(b'CGPE') and b'private' not in bytes(selected['bytes'])[64:]
   # Leaving the chat with a secure picker open must never hand plaintext to
   # the host, including when the URL no longer contains any chat identifier.
   with pages[0].expect_file_chooser() as chooser:pages[0].locator('#ciphergap-secure-files').click()
   pages[0].evaluate('location.hash=""')
   chooser.value.set_files({'name':'do-not-send.txt','mimeType':'text/plain','buffer':b'private after navigation'})
   pages[0].wait_for_function('document.getElementById("ciphergap-live-notice")?.textContent.includes("active chat changed")')
   assert pages[0].evaluate('received.length')==2
   pages[0].evaluate('location.hash="#601"')
   try:pages[0].wait_for_selector('#ciphergap-secure-files:not([disabled])',timeout=5000)
   except Exception:
    print('CHAT RETURN',pages[0].evaluate('({url:location.href,toolbar:document.getElementById("ciphergap-toolbar")?.textContent,notice:document.getElementById("ciphergap-live-notice")?.textContent})'),action(0,{'action':'get_chat_context'}),errors,flush=True)
    raise
   for name,mime,data,kind in media_fixtures(root):
    encoded=kernel.evaluate('async args=>{'+ENCRYPT_JS.replace('arguments[0]','args')+'}',[list(data),name,mime,stored[keynames[0]]])
    sid=pages[1].evaluate('a=>addAttachment(...a)',[encoded,name]);row=pages[1].locator('[data-mid="'+sid+'"]' if platform=='eitaa' else '#message-'+sid)
    row.locator('.ciphergap-file-decrypt-button').click()
    viewer=pages[1].locator('dialog[data-ciphergap-ui=file-viewer]');viewer.wait_for(state='visible')
    assert viewer.locator('h2').inner_text()==name
    if kind=='img':pages[1].wait_for_function('document.querySelector(".ciphergap-file-viewer img")?.naturalWidth===128')
    elif kind in ['audio','video']:
     viewer.locator(kind).evaluate('(m)=>m.play()');pages[1].wait_for_function('document.querySelector(".ciphergap-file-viewer audio,.ciphergap-file-viewer video")?.currentTime>0')
    with pages[1].expect_download() as download:viewer.locator('.ciphergap-file-viewer__download').click()
    assert download.value.suggested_filename==name and Path(download.value.path()).read_bytes()==data
    viewer.locator('header button').click()
   # Automatic receipt is opt-in and excludes old IDs and outgoing documents.
   data=bytes(range(256))*16;name='automatic-'+platform+'.bin'
   encoded=kernel.evaluate('async args=>{'+ENCRYPT_JS.replace('arguments[0]','args')+'}',[list(data),name,'application/octet-stream',stored[keynames[0]]])
   assert action(1,{'action':'set_auto_files','enabled':True})['ok']
   downloads=[];pages[1].on('download',lambda d:downloads.append(d))
   pages[1].evaluate('a=>{const id=addAttachment(...a);const r=document.querySelector("[data-mid=\\""+id+"\\"],#message-"+id);r.dataset.timestamp="1";if(r.dataset.messageId){r.dataset.messageId="1";r.id="message-1";}}',[encoded,name])
   pages[1].evaluate('a=>addAttachment(...a,false)',[encoded,name]);pages[1].wait_for_timeout(500)
   assert not downloads
   with pages[1].expect_download() as download:pages[1].evaluate('a=>addAttachment(...a)',[encoded,name])
   assert download.value.suggested_filename==name and Path(download.value.path()).read_bytes()==data
   pages[0].locator('#ciphergap-chat-toggle').click();pages[0].wait_for_selector('#ciphergap-secure-files[disabled]');assert not pages[0].locator('#ciphergap-btn').is_visible()
   pages[0].locator('#ciphergap-chat-toggle').click();pages[0].wait_for_selector('#ciphergap-secure-files:not([disabled])')
   expired=kernel.evaluate("""async()=>{const s=await CipherGapShared.ecdh.create_dh_session();return CipherGapShared.protocol.build_start_exchange_message(s.nonce,s.publicKeyB64,s.codecId,Date.now()+3000)}""")
   pages[1].evaluate('s=>addMessage(s)',expired);pages[1].wait_for_selector('.ciphergap-chat-card--expired')
   pages[1].screenshot(path='/tmp/ciphergap-'+platform+'-fixture.png',full_page=True)
   assert not errors,errors
   print('PASS',platform,'native send + retained draft, two-party ECDH/SAS, strict native timestamp handling, ordinary/encrypted upload, image/audio/video playback + exact manual/automatic downloads, history/outgoing exclusion, abandoned secure selection, expiry and pause',flush=True)
   for page in pages:page.close()
  ctx.close()
finally:shutil.rmtree(profile,ignore_errors=True)
