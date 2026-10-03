import sys,time,json,base64,tempfile
from pathlib import Path
import os,shutil,importlib.util,gc
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('builder',ROOT/'tools/build_extension.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
from marionette_driver.marionette import Marionette
from marionette_driver.addons import Addons
folder=Path(tempfile.mkdtemp(prefix='ciphergap-ff-downloads-'))
m=Marionette(bin=os.environ.get('FIREFOX_BINARY','/usr/lib/firefox-esr/firefox-esr'),port=0,headless=True,app_args=['--remote-allow-system-access'],gecko_log='/tmp/ciphergap-firefox-gecko.log',prefs={'browser.download.folderList':2,'browser.download.dir':str(folder),'browser.download.useDownloadDir':True,'browser.helperApps.neverAsk.saveToDisk':'application/octet-stream,text/plain'})
def async_js(js,args=[]):
 return m.execute_async_script('const done=arguments[arguments.length-1];(async()=>{'+js+'})().then(done).catch(e=>done({error:String(e),stack:e.stack}));',script_args=args,sandbox=None)
def script(js,script_args=()):
 return m.execute_script(js,script_args=script_args,sandbox=None)
def check(value):
 if isinstance(value,dict) and value.get('error'):raise RuntimeError(value)
 return value
def poll(fn,condition,seconds=12):
 stop=time.time()+seconds
 while time.time()<stop:
  value=fn()
  if condition(value):return value
  time.sleep(.1)
 raise AssertionError(value)
fixture='''window.stop();history.replaceState(null,'','/chat?uid='+arguments[0]);document.body.innerHTML='<main><div id="message_list_scroller_id"></div><footer id="chat_footer"><input type="file"><div id="editable-message-text" contenteditable="true"></div><div><button aria-label="send-button">Send</button></div></footer></main>';window.testSent=[];document.querySelector('[aria-label="send-button"]').onclick=()=>{testSent.push(document.getElementById('editable-message-text').textContent);document.getElementById('editable-message-text').textContent='';};'''
def append_message(handle,text):
 m.switch_to_window(handle)
 script('''const row=document.createElement('div');row.dataset.sid='client-message:'+crypto.randomUUID();row.dataset.date=String(Date.now());row.setAttribute('aria-label','message-item');row.innerHTML='<svg aria-label="LeftBubble-icon"></svg><div><p></p></div>';row.querySelector('p').textContent=arguments[0];document.getElementById('message_list_scroller_id').append(row);''',script_args=[text])
try:
 m.start_session();m.timeout.page_load=25;m.timeout.script=20
 print('Firefox',m.session_capabilities['browserVersion'],flush=True)
 import zipfile
 package=Path(tempfile.mkdtemp(prefix='ciphergap-ff-package-'))
 with zipfile.ZipFile(builder.build('firefox',package/'extension.zip')) as z:z.extractall(package)
 (package/'extension.zip').unlink()
 addon=Addons(m).install(str(package),temp=True)
 m.set_context('chrome')
 meta=check(async_js('''const {ExtensionParent}=ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');const e=ExtensionParent.GlobalManager.getExtension(arguments[0]);await e.wakeupBackground();return {base:e.baseURI.spec,errors:e.errors,warnings:e.warnings};''',[addon]))
 assert not meta['errors'] and not meta['warnings'],meta
 m.set_context('content');m.navigate(meta['base']+'popup/popup.html')
 extension_handle=m.current_window_handle
 check(async_js('await browser.storage.local.clear();return true;'))
 tabs=[]
 for uid in ['601','602']:
  tab=check(async_js('const t=await browser.tabs.create({url:"https://web.bale.ai/chat?uid="+arguments[0],active:false});return {id:t.id};',[uid]));tabs.append(tab['id'])
 handles=[x for x in m.window_handles if x!=extension_handle]
 for uid,handle in zip(['601','602'],handles):
  m.switch_to_window(handle)
  poll(lambda:script('return location.hostname'),lambda host:host=='web.bale.ai')
  time.sleep(1)
  script(fixture,script_args=[uid])
  poll(lambda:script('return document.getElementById("ciphergap-toolbar")?.textContent'),lambda s:s and 'Set up security' in s)
 print('PASS installed, background, MAIN bridge and isolated toolbar in two Bale fixtures',flush=True)
 m.switch_to_window(extension_handle)
 contexts=[check(async_js('return await browser.tabs.sendMessage(arguments[0],{action:"get_chat_context"});',[t])) for t in tabs]
 assert [x['storageKey'] for x in contexts]==['web.bale.ai_601','web.bale.ai_602'],contexts
 def action(i,data):
  m.switch_to_window(extension_handle)
  return check(async_js('return await browser.tabs.sendMessage(arguments[0],arguments[1]);',[tabs[i],dict(data,expectedStorageKey=contexts[i]['storageKey'])]))
 started=action(0,{'action':'start_key_exchange'});assert started['ok'],started
 m.switch_to_window(handles[0]);request=script('return testSent.at(-1)');append_message(handles[1],request)
 m.switch_to_window(extension_handle)
 statuskey='exchange_status_'+contexts[1]['storageKey']
 poll(lambda:check(async_js('return (await browser.storage.local.get(arguments[0]))[arguments[0]];',[statuskey])),lambda x:x and x.get('status')=='incoming')
 accepted=action(1,{'action':'respond_key_exchange','accept':True,'nonce':started['nonce']});assert accepted['ok'],accepted
 m.switch_to_window(handles[1]);ack=script('return testSent.find(x=>x.startsWith("start exchange ack:"))');assert ack;append_message(handles[0],ack)
 m.switch_to_window(extension_handle)
 keys=[x['storageKey'] for x in contexts]
 storage=poll(lambda:check(async_js('return await browser.storage.local.get(arguments[0]);',[keys+['exchange_status_'+k for k in keys]])),lambda x:all(x.get(k) for k in keys))
 assert storage[keys[0]]==storage[keys[1]]
 assert storage['exchange_status_'+keys[0]]['sas']==storage['exchange_status_'+keys[1]]['sas']
 for i in [0,1]:
  verified=action(i,{'action':'mark_key_verified','nonce':started['nonce']});assert verified['ok'],verified
 print('PASS real content-script ECDH, matching SAS and verification in both fixtures',flush=True)
 for i in [0,1]:assert action(i,{'action':'set_auto_decrypt','enabled':True})['ok']
 action(0,{"action":"get_chat_context"})
 check(async_js("await browser.tabs.update(arguments[0],{active:true});return true;",[tabs[0]]))
 time.sleep(3)
 m.switch_to_window(handles[0]);script('document.getElementById("editable-message-text").textContent="Firefox — سلام، پیام رمز‌شده";document.getElementById("editable-message-text").dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("ciphergap-btn").click();')
 packet=poll(lambda:script('return testSent.at(-1)'),lambda s:s and s.startswith('CGP|'))
 # Wait for this send; an earlier verification confirmation is also a CGP packet.
 poll(lambda:script('return document.getElementById("ciphergap-btn").disabled'),lambda x:not x)
 packet=script('return testSent.at(-1)');append_message(handles[1],packet)
 text=poll(lambda:script('return document.getElementById("message_list_scroller_id").textContent'),lambda s:'Firefox — سلام، پیام رمز‌شده' in s)
 print('PASS encrypted composer text and automatic peer decryption',flush=True)
 m.switch_to_window(extension_handle)
 check(async_js('''for(const file of ['encoding','crypto','file_crypto']) {await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='../share/'+file+'.js';s.onload=resolve;s.onerror=reject;document.head.append(s)});}return true;'''))
 encoded=check(async_js('''const key=(await browser.storage.local.get(arguments[0]))[arguments[0]];const bytes=Uint8Array.from({length:4096},(_,i)=>i%256);const file=await CipherGapShared.file_crypto.encrypt_file(new File([bytes],'firefox-fixture.bin',{type:'application/octet-stream'}),key);return btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));''',[keys[1]]))
 assert action(0,{'action':'set_auto_files','enabled':True})['ok']
 check(async_js('await browser.tabs.update(arguments[0],{active:true});return true;',[tabs[0]]))
 m.switch_to_window(handles[0])
 script('''const bytes=Uint8Array.from(atob(arguments[0]),c=>c.charCodeAt(0));const blob=new Blob([bytes]);const row=document.createElement('div');row.dataset.sid='client-message:'+crypto.randomUUID();row.dataset.date=String(Date.now());row.setAttribute('aria-label','message-item');row.innerHTML='<svg aria-label="LeftBubble-icon"></svg><div><a><div><div><img alt="file"></div></div><div><p>firefox-fixture.bin.cgpe</p><p>4 KB</p></div></a></div>';row.querySelector('a p').onclick=()=>{const a=document.createElement('a');a.download='firefox-fixture.bin.cgpe';a.href=URL.createObjectURL(blob);document.body.append(a);a.click();a.remove();};document.getElementById('message_list_scroller_id').append(row);''',script_args=[encoded])
 poll(lambda:(folder/'firefox-fixture.bin').is_file() and (folder/'firefox-fixture.bin').stat().st_size==4096,lambda x:x,seconds=45)
 assert (folder/'firefox-fixture.bin').read_bytes()==bytes(range(256))*16
 assert not list(folder.glob('*.cgpe'))
 print('PASS native MAIN/isolated bridge, automatic file decrypt/download and exact byte comparison',flush=True)
 m.switch_to_window(extension_handle);m.navigate(meta['base']+f'popup/popup.html?tabId={tabs[0]}')
 poll(lambda:script('return document.querySelector("#securityCard").dataset.view'),lambda x:x=='verified')
 script('document.getElementById("nav-files").click()')
 assert script('return document.getElementById("autoFilesToggle").checked')
 print('PASS actual Firefox popup, bound tab context and saved per-chat settings',flush=True)
finally:
 m.quit(in_app=False);m.cleanup();del m;gc.collect()
 shutil.rmtree(folder,ignore_errors=True)
 if "package" in globals():shutil.rmtree(package,ignore_errors=True)
