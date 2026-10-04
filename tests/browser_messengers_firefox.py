"""Firefox addon integration over the same Eitaa/Telegram DOM contracts."""
import os,time,tempfile,shutil,zipfile,importlib.util,json,gc
from pathlib import Path
from messenger_fixtures import html
from browser_fixtures import media_fixtures,ENCRYPT_JS
from marionette_driver.marionette import Marionette
from marionette_driver.addons import Addons
from marionette_driver.by import By
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('builder',root/'tools/build_extension.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
folder=Path(tempfile.mkdtemp(prefix='ciphergap-ff-messengers-'));package=folder/'extension';package.mkdir()
m=Marionette(bin=os.environ.get('FIREFOX_BINARY','/usr/lib/firefox-esr/firefox-esr'),port=0,headless=True,app_args=['--remote-allow-system-access'],gecko_log='/tmp/ciphergap-firefox-messengers.log',prefs={'browser.download.folderList':2,'browser.download.dir':str(folder),'browser.download.useDownloadDir':True,'browser.helperApps.neverAsk.saveToDisk':'application/octet-stream,image/png,audio/wav,audio/vnd.wave,video/webm,text/html'})
def js(code,args=()):return m.execute_script(code,script_args=args,sandbox=None)
def async_js(code,args=()):
 value=m.execute_async_script('const done=arguments[arguments.length-1];(async()=>{'+code+'})().then(done).catch(e=>done({error:String(e)}));',script_args=args,sandbox=None)
 if isinstance(value,dict) and value.get('error'):raise AssertionError(value)
 return value
def poll(fn,accept,seconds=20):
 stop=time.time()+seconds
 while time.time()<stop:
  value=fn()
  if accept(value):return value
  time.sleep(.1)
 print("DIAGNOSTIC",js('return {url:location.href,toolbar:document.getElementById("ciphergap-toolbar")?.textContent,notice:document.getElementById("ciphergap-live-notice")?.textContent,buttons:[...document.querySelectorAll(".ciphergap-file-decrypt-button")].map(b=>({text:b.textContent,state:b.dataset.state,disabled:b.disabled})),rows:[...document.querySelectorAll("[data-mid][data-timestamp],[data-message-id][id]")].map(e=>({id:e.id,attrs:[...e.attributes].filter(a=>a.name!=="class").map(a=>[a.name,a.value]),prefix:e.textContent.slice(0,70),cards:e.querySelectorAll("[data-ciphergap-ui=protocol]").length}))};'),flush=True)
 raise AssertionError(f"Received {len(value)} bytes, expected exact original" if isinstance(value,bytes) else value)
try:
 with zipfile.ZipFile(builder.build('firefox',folder/'addon.zip')) as z:z.extractall(package)
 m.start_session();m.timeout.script=25;m.timeout.page_load=25
 # Replace only this isolated profile's main-frame responses. Keep the real
 # origins/permissions while preventing host scripts from changing fixtures.
 routes=folder/'fixtures';routes.mkdir()
 (routes/'manifest.json').write_text(json.dumps({'manifest_version':2,'name':'CipherGap isolated DOM fixtures','version':'1.0','permissions':['webRequest','webRequestBlocking','https://web.eitaa.com/*','https://web.telegram.org/a/*'],'background':{'scripts':['fixture.js']}}))
 (routes/'fixture.js').write_text('const fixtures='+json.dumps({p:html(p) for p in ['eitaa','telegram']})+'''
 browser.webRequest.onBeforeRequest.addListener(details=>{
 const filter=browser.webRequest.filterResponseData(details.requestId);
 filter.ondata=()=>{};
 filter.onstop=()=>{filter.write(new TextEncoder().encode(fixtures[details.url.includes('eitaa')?'eitaa':'telegram']));filter.close();};
 return {};
 },{urls:['https://web.eitaa.com/*','https://web.telegram.org/a/*'],types:['main_frame']},['blocking']);
 ''')
 Addons(m).install(str(routes),temp=True)
 addon=Addons(m).install(str(package),temp=True);m.set_context('chrome')
 meta=async_js('const {ExtensionParent}=ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");const e=ExtensionParent.GlobalManager.getExtension(arguments[0]);await e.wakeupBackground();return {base:e.baseURI.spec,errors:e.errors,warnings:e.warnings};',[addon]);assert not meta['errors'] and not meta['warnings'],meta
 m.set_context('content');m.navigate(meta['base']+'popup/popup.html');kernel=m.current_window_handle
 async_js("for(const file of ['encoding','crypto','file_crypto','dh_crypto','stickers'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='../share/'+file+'.js';s.onload=resolve;s.onerror=reject;document.head.append(s)});return true;")
 for platform,base in [('eitaa','https://web.eitaa.com/'),('telegram','https://web.telegram.org/a/')]:
  handles=[]
  for uid in [601,602]:
   m.switch_to_window(kernel);before=set(m.window_handles);async_js('return (await browser.tabs.create({url:arguments[0],active:false})).id;',[base+'#'+str(uid)]);handle=next(h for h in m.window_handles if h not in before);handles.append(handle);m.switch_to_window(handle);poll(lambda:js('return location.href;'),lambda s:bool(s) and s.startswith(base));time.sleep(1)
   poll(lambda:js('return document.getElementById("ciphergap-toolbar")?.textContent;'),lambda s:s and 'Set up security' in s)
  m.switch_to_window(kernel);tabs=async_js('return (await browser.tabs.query({url:arguments[0]+"*"})).map(t=>t.id);',[base])
  contexts=[async_js('return browser.tabs.sendMessage(arguments[0],{action:"get_chat_context"});',[t]) for t in tabs]
  print("CONTEXT",platform,contexts,flush=True)
  assert len(tabs)==2 and all(c['ok'] and c['messenger']==platform for c in contexts),contexts
  def action(i,message):
   m.switch_to_window(kernel)
   value=async_js('return browser.tabs.sendMessage(arguments[0],arguments[1]);',[tabs[i],dict(message,expectedStorageKey=contexts[i]['storageKey'])]);assert value['ok'],value;return value
  start=action(0,{'action':'start_key_exchange'});m.switch_to_window(handles[0]);request=js('return testSent.at(-1)')
  m.switch_to_window(handles[1]);js('addMessage(arguments[0]);',[request]);poll(lambda:js('const b=document.querySelector("[data-ciphergap-exchange-action=accept]");return b && !b.hidden && !b.disabled && b.getClientRects().length>0;'),bool)
  m.find_element(By.CSS_SELECTOR,'[data-ciphergap-exchange-action=accept]').click()
  ack=poll(lambda:js('return testSent.find(s=>s.startsWith("start exchange ack:"));'),bool)
  m.switch_to_window(handles[0]);js('addMessage(arguments[0]);',[ack]);poll(lambda:js('return testSent.some(s=>s.startsWith("cg-sas|"));'),bool)
  m.switch_to_window(kernel);keys=[c['storageKey'] for c in contexts];stored=poll(lambda:async_js('return browser.storage.local.get(arguments[0]);',[keys+['exchange_status_'+k for k in keys]]),lambda s:all(s.get(k) for k in keys))
  assert stored[keys[0]]==stored[keys[1]] and stored['exchange_status_'+keys[0]]['sas']==stored['exchange_status_'+keys[1]]['sas']
  for i in [0,1]:action(i,{'action':'mark_key_verified','nonce':start['nonce']})
  m.switch_to_window(handles[0]);js('const e=document.querySelector("[contenteditable=true]");e.textContent=arguments[0];e.dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("ciphergap-btn").click();',['Firefox '+platform+' — سلام'])
  poll(lambda:js('return !document.getElementById("ciphergap-btn").disabled;'),bool);packet=js('return testSent.at(-1);');assert packet.startswith('CGP|')
  m.switch_to_window(handles[1]);sid=js('return addMessage(arguments[0]);',[packet]);row=f'[data-mid="{sid}"]' if platform=='eitaa' else '#message-'+sid
  if platform=='eitaa':js('const r=document.querySelector(arguments[0]),quote=document.createElement("div");quote.dir="auto";quote.textContent="CGP|1|AESGCM|1|truncatedQuotedCiphertext";r.firstElementChild.prepend(quote);',[row])
  poll(lambda:js('return Boolean(document.querySelector(arguments[0]+" .ciphergap-decrypt-button"));',[row]),bool);m.find_element(By.CSS_SELECTOR,row+' .ciphergap-decrypt-button').click()
  text=poll(lambda:js('return document.querySelector(arguments[0]+" .ciphergap-plaintext")?.textContent;',[row]),bool);assert text=='Firefox '+platform+' — سلام'
  box=js('const p=document.querySelector(arguments[0]+" .ciphergap-plaintext");const r=p.getBoundingClientRect();return {width:r.width,height:r.height};',[row]);assert box['width']>100 and box['height']<60,box
  # Unicode emoji and native image-backed emoji preserve their full sequence.
  m.switch_to_window(handles[0]);js('const e=document.querySelector("[contenteditable=true]");e.replaceChildren(document.createTextNode("سلام "));const img=document.createElement("img");img.alt="👨‍👩‍👧‍👦";e.append(img,document.createElement("br"),document.createTextNode("👍🏽 ❤️"));e.dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("ciphergap-btn").click();')
  poll(lambda:js('return !document.getElementById("ciphergap-btn").disabled;'),bool);packet=js('return testSent.at(-1)');assert packet.startswith('CGP|')
  m.switch_to_window(handles[1]);sid=js('return addMessage(arguments[0]);',[packet]);emoji_row=f'[data-mid="{sid}"]' if platform=='eitaa' else '#message-'+sid
  poll(lambda:js('return Boolean(document.querySelector(arguments[0]+" .ciphergap-decrypt-button"));',[emoji_row]),bool);m.find_element(By.CSS_SELECTOR,emoji_row+' .ciphergap-decrypt-button').click()
  text=poll(lambda:js('return document.querySelector(arguments[0]+" .ciphergap-plaintext")?.textContent;',[emoji_row]),bool);assert text=='سلام 👨‍👩‍👧‍👦\n👍🏽 ❤️'
  # A sticker traverses real Firefox File/DataTransfer and the native upload.
  picture=(root/'CipherGap/assets/icon128.png').read_bytes()
  m.switch_to_window(handles[0]);js('document.getElementById("ciphergap-media").click();')
  poll(lambda:js('return Boolean(document.querySelector("dialog[data-ciphergap-ui=media-picker]"));'),bool)
  m.find_element(By.ID,'ciphergap-media-tab-1').click();m.find_element(By.CSS_SELECTOR,'.ciphergap-media-picker__import').click()
  js('const input=document.querySelector(".ciphergap-media-picker input[type=file]"),dt=new DataTransfer();dt.items.add(new File([new Uint8Array(arguments[0])],"secret-sticker.png",{type:"image/png"}));input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));',[list(picture)])
  upload=poll(lambda:js('return received[0];'),bool);assert upload['name'].endswith('.cgst.cgpe') and b'secret-sticker.png' not in bytes(upload['bytes'])
  m.switch_to_window(handles[1]);sid=js('return addAttachment(arguments[0],arguments[1]);',[upload['bytes'],upload['name'][:-5]]);sticker_row=f'[data-mid="{sid}"]' if platform=='eitaa' else '#message-'+sid
  poll(lambda:js('return Boolean(document.querySelector(arguments[0]+" .ciphergap-file-decrypt-button"));',[sticker_row]),bool);m.find_element(By.CSS_SELECTOR,sticker_row+' .ciphergap-file-decrypt-button').click()
  poll(lambda:js('return document.querySelector(arguments[0]+" .ciphergap-sticker-inline img")?.naturalWidth;',[sticker_row]),lambda w:w==128)
  m.find_element(By.CSS_SELECTOR,sticker_row+' .ciphergap-sticker-inline button').click();poll(lambda:(folder/'secret-sticker.png').read_bytes() if (folder/'secret-sticker.png').exists() else None,lambda value:value==picture);(folder/'secret-sticker.png').unlink()
  m.find_element(By.CSS_SELECTOR,sticker_row+' .ciphergap-sticker-inline img').click();poll(lambda:js('return Boolean(document.querySelector("dialog[data-ciphergap-ui=file-viewer]"));'),bool)
  m.find_element(By.CSS_SELECTOR,'.ciphergap-file-viewer header button').click();assert js('return Boolean(document.querySelector(arguments[0]+" .ciphergap-sticker-inline img"));',[sticker_row])
  video=next(item for item in media_fixtures(root) if item[3]=='video');m.switch_to_window(kernel)
  animated=async_js('const f=await CipherGapShared.stickers.pack(new File([new Uint8Array(arguments[0])],"motion.webm",{type:"video/webm"}));const e=await CipherGapShared.file_crypto.encrypt_file(f,arguments[1]);return {bytes:Array.from(new Uint8Array(await e.arrayBuffer())),name:e.name.slice(0,-5)};',[list(video[2]),stored[keys[0]]])
  m.switch_to_window(handles[1]);sid=js('return addAttachment(arguments[0],arguments[1]);',[animated['bytes'],animated['name']]);animated_row=f'[data-mid="{sid}"]' if platform=='eitaa' else '#message-'+sid
  poll(lambda:js('return Boolean(document.querySelector(arguments[0]+" .ciphergap-file-decrypt-button"));',[animated_row]),bool);m.find_element(By.CSS_SELECTOR,animated_row+' .ciphergap-file-decrypt-button').click()
  poll(lambda:js('return Boolean(document.querySelector(".ciphergap-sticker-inline video"));'),bool);async_js('await document.querySelector(".ciphergap-sticker-inline video").play();return true;');poll(lambda:js('return document.querySelector(".ciphergap-sticker-inline video").currentTime;'),lambda t:t>0)
  m.find_element(By.ID,'ciphergap-chat-toggle').click();poll(lambda:js('return document.getElementById("ciphergap-secure-files").disabled;'),bool)
  assert not js('return Boolean(document.querySelector(".ciphergap-sticker-inline, .ciphergap-plaintext"));')
  assert js('return !document.querySelector(arguments[0]+" [data-ciphergap-message-raw]").hidden;',[row])
  m.find_element(By.ID,'ciphergap-chat-toggle').click();poll(lambda:js('return !document.getElementById("ciphergap-secure-files").disabled;'),bool)
  # Native upload handoff, including Telegram's detached input, uses actual
  # Firefox File/DataTransfer objects and the native onchange callback.
  m.switch_to_window(handles[0]);js('document.getElementById("ciphergap-secure-files").click();')
  poll(lambda:js('return Boolean(document.querySelector("input[data-ciphergap-internal-file-input]"));'),bool)
  js('const picker=document.querySelector("input[data-ciphergap-internal-file-input]"),dt=new DataTransfer();dt.items.add(new File(["private Firefox bytes"],"private.txt",{type:"text/plain"}));picker.files=dt.files;picker.dispatchEvent(new Event("change",{bubbles:true}));')
  upload=poll(lambda:js('return received[1];'),bool);assert upload['name']=='private.txt.cgpe' and bytes(upload['bytes']).startswith(b'CGPE')
  for name,mime,data,kind in media_fixtures(root):
   m.switch_to_window(kernel);encoded=async_js(ENCRYPT_JS,[ [list(data),name,mime,stored[keys[0]]] ])
   m.switch_to_window(handles[1]);sid=js('return addAttachment(arguments[0],arguments[1]);',[encoded,name]);row=f'[data-mid="{sid}"]' if platform=='eitaa' else '#message-'+sid
   poll(lambda:js('return Boolean(document.querySelector(arguments[0]+" .ciphergap-file-decrypt-button"));',[row]),bool);m.find_element(By.CSS_SELECTOR,row+' .ciphergap-file-decrypt-button').click()
   poll(lambda:js('return Boolean(document.querySelector("dialog[data-ciphergap-ui=file-viewer]"));'),bool)
   assert js('return document.querySelector(".ciphergap-file-viewer h2").textContent;')==name
   if kind=='img':poll(lambda:js('return document.querySelector(".ciphergap-file-viewer img")?.naturalWidth;'),lambda w:w==128)
   elif kind in ['audio','video']:
    async_js('await document.querySelector(".ciphergap-file-viewer '+kind+'").play();return true;');poll(lambda:js('return document.querySelector(".ciphergap-file-viewer '+kind+'").currentTime;'),lambda t:t>0)
   js('document.querySelector(".ciphergap-file-viewer__download").click();');poll(lambda:(folder/name).read_bytes() if (folder/name).exists() else None,lambda value:value==data)
   (folder/name).unlink()
   js('document.querySelector(".ciphergap-file-viewer header button").click();')
  data=bytes(range(256))*16;name='automatic-'+platform+'.bin'
  m.switch_to_window(kernel);encoded=async_js(ENCRYPT_JS,[[list(data),name,'application/octet-stream',stored[keys[0]]]])
  action(1,{'action':'set_auto_files','enabled':True});m.switch_to_window(handles[1])
  js('const id=addAttachment(arguments[0],arguments[1]);const r=document.querySelector("[data-mid=\\""+id+"\\"],#message-"+id);r.dataset.timestamp="1";if(r.dataset.messageId){r.dataset.messageId="1";r.id="message-1";}',[encoded,name])
  js('addAttachment(arguments[0],arguments[1],false);',[encoded,name]);time.sleep(.5);assert not (folder/name).exists()
  js('addAttachment(arguments[0],arguments[1]);',[encoded,name]);poll(lambda:(folder/name).read_bytes() if (folder/name).exists() else None,lambda value:value==data)
  m.switch_to_window(handles[0]);js('document.getElementById("ciphergap-chat-toggle").click();');poll(lambda:js('return document.getElementById("ciphergap-secure-files").disabled;'),bool)
  print('PASS Firefox',m.session_capabilities['browserVersion'],platform,'two-party ECDH/SAS, natural bubble widths, image-backed emoji, encrypted PNG/WebM stickers and exact downloads, encrypted text, native encrypted upload, image/audio/video playback, exact manual/automatic downloads, history/outgoing exclusion and pause',flush=True)
  for handle in handles:m.switch_to_window(handle);m.close()
finally:
 try:m.quit();del m;gc.collect()
 except Exception:pass
 shutil.rmtree(folder,ignore_errors=True)
