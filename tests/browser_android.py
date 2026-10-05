"""Real Android WebView + real desktop extension, using sanitized native DOM fixtures.

Only runs on an emulator. Never reads a real user's messenger accounts.
Requires the existing Playwright installation, websockets, adb and a compatible WebView.
"""
import ast
import base64
import json
import http.client
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request
import xml.etree.ElementTree as ET
from websockets.sync.client import connect
from playwright.sync_api import sync_playwright
from messenger_fixtures import html
from browser_fixtures import media_fixtures

ROOT = Path(__file__).resolve().parents[1]
APP = 'com.ciphergap.mobile'
ADB = os.environ.get('CIPHERGAP_ADB', str(Path(os.environ.get('ANDROID_HOME','')) / 'platform-tools/adb'))
PORT = 9223
OUT = ROOT / 'dist/android-validation'

def adb(*args, binary=False):
    return subprocess.check_output([ADB, '-s', 'emulator-5554', *args], text=not binary)

def wait(check, timeout=30):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        try:result=check()
        except (subprocess.CalledProcessError,RuntimeError):result=None  # Reloads replace the CDP execution context.
        if result:return result
        time.sleep(.1)
    raise AssertionError('Timed out waiting for Android state')

def targets():
    try:return json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json',timeout=3))
    except (urllib.error.URLError,http.client.RemoteDisconnected):return []

class CDP:
    def __init__(self, target):
        self.ws=connect(target['webSocketDebuggerUrl'], origin=None)
        self.serial=0;self.responses={};self.contexts={};self.fixture=None
        self.call('Runtime.enable')
    def call(self, method, params=None):
        self.serial+=1;ident=self.serial
        self.ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
        while ident not in self.responses:
            message=json.loads(self.ws.recv(timeout=70))
            if 'id' in message:self.responses[message['id']]=message
            elif message.get('method')=='Runtime.executionContextCreated':
                c=message['params']['context'];self.contexts[c['id']]=c
            elif message.get('method')=='Runtime.executionContextsCleared':self.contexts.clear()
            elif message.get('method')=='Runtime.executionContextDestroyed':self.contexts.pop(message['params']['executionContextId'],None)
            elif message.get('method')=='Fetch.requestPaused':
                p=message['params']
                if self.fixture and p.get('resourceType')=='Document':
                    self.call('Fetch.fulfillRequest',{'requestId':p['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode(self.fixture.encode()).decode()})
                else:self.call('Fetch.continueRequest',{'requestId':p['requestId']})
        result=self.responses.pop(ident)
        if 'error' in result:raise RuntimeError(result['error'])
        return result.get('result',{})
    def evaluate(self, expression, isolated=False):
        params={'expression':expression,'returnByValue':True,'awaitPromise':True,'userGesture':True}
        if isolated:
            candidates=[c for c in self.contexts.values() if not c.get('auxData',{}).get('isDefault',True)]
            for c in candidates:
                probe=self.call('Runtime.evaluate',{'expression':'typeof CipherGapHost','contextId':c['id'],'returnByValue':True})
                if probe.get('result',{}).get('value')=='object':params['contextId']=c['id'];break
            else:raise AssertionError('CipherGap isolated execution world missing')
        result=self.call('Runtime.evaluate',params)
        if 'exceptionDetails' in result:raise RuntimeError(result['exceptionDetails'].get('exception',{}).get('description',str(result)))
        return result.get('result',{}).get('value')
    def navigate_fixture(self,url,fixture):
        self.fixture=fixture
        self.call('Page.stopLoading')
        self.call('Network.enable')
        self.call('Network.setBypassServiceWorker',{'bypass':True})
        self.call('Network.setCacheDisabled',{'cacheDisabled':True})
        self.call('Fetch.enable',{'patterns':[{'urlPattern':'*','resourceType':'Document'}]})
        # Hash-only SPA navigation does not request a new document. Force an
        # actual document load so the network fixture and host injection run.
        path,separator,fragment=url.partition('#')
        url=path+('&' if '?' in path else '?')+'cgFixture='+str(time.time_ns())+(separator+fragment if separator else '')
        self.call('Page.navigate',{'url':url})
        wait(lambda:self.evaluate('document.readyState === "complete" && Boolean(document.getElementById("ciphergap-toolbar"))'))
    def screenshot(self,name):
        image=self.call('Page.captureScreenshot',{'format':'png'})['data']
        (OUT/name).write_bytes(base64.b64decode(image))
    def close(self):self.ws.close()

def tap_text(text):
    def find():
        adb('shell','uiautomator','dump','/sdcard/cg-ui.xml')
        root=ET.fromstring(adb('shell','cat','/sdcard/cg-ui.xml'))
        for node in root.iter('node'):
            if node.get('text','').casefold()==text.casefold() or node.get('content-desc','').casefold()==text.casefold():
                a,b,c,d=map(int,re.findall(r'\d+',node.get('bounds')))
                return ((a+c)//2,(b+d)//2)
    x,y=wait(find,15);adb('shell','input','tap',str(x),str(y))

def tap_resource(suffix):
    def find():
        adb('shell','uiautomator','dump','/sdcard/cg-ui.xml')
        root=ET.fromstring(adb('shell','cat','/sdcard/cg-ui.xml'))
        for node in root.iter('node'):
            resource=node.get('resource-id','').split('/')[-1]
            if resource==suffix or (suffix=='permission_deny_button' and resource=='permission_deny_and_dont_ask_again_button'):
                a,b,c,d=map(int,re.findall(r'\d+',node.get('bounds')))
                return ((a+c)//2,(b+d)//2)
    x,y=wait(find,15);adb('shell','input','tap',str(x),str(y))

def pick_uploaded_file(filename):
    try:tap_text(filename)
    except AssertionError:
        tap_text('Show roots');tap_text('Downloads');tap_text(filename)

def bale_fixture():
    tree=ast.parse((ROOT/'tests/browser_chrome.py').read_text())
    fixture=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='fixture' for t in n.targets))
    extra="""window.addMessage=(text,incoming=true)=>{const row=document.createElement('div');row.dataset.sid=String(++window.messageCounter);row.dataset.date=String(Date.now());row.setAttribute('aria-label','message-item');const p=document.createElement('p');p.textContent=text;if(incoming){const icon=document.createElement('span');icon.setAttribute('aria-label','LeftBubble-icon');row.append(icon);}row.append(p);document.getElementById('message_list_scroller_id').append(row);return row.dataset.sid;};window.messageCounter=100;window.addAttachment=(bytes,name)=>{const id=addMessage(''),r=document.querySelector('[data-sid="'+id+'"]');r.replaceChildren();const icon=document.createElement('span');icon.setAttribute('aria-label','LeftBubble-icon');const outer=document.createElement('div'),a=document.createElement('a');a.innerHTML='<div><div><img alt="file"></div></div><div><p></p></div>';a.querySelector('p').textContent=name+'.cgpe';a.onclick=()=>{const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([new Uint8Array(bytes)]));link.download=name+'.cgpe';link.click();};outer.append(a);r.append(icon,outer);return id;};"""
    return fixture.replace('</script>',extra+'</script>').replace('<head>','<head><meta name="viewport" content="width=device-width,initial-scale=1">')

def mobile_fixture(platform):
    fixture=bale_fixture() if platform=='bale' else html(platform)
    if platform=='bale':
        fixture=fixture.replace('<div id="editable-message-text" contenteditable="true"></div>','<textarea id="editable-message-text" aria-label="Message"></textarea>')
        fixture=fixture.replace("document.getElementById('editable-message-text').textContent","document.getElementById('editable-message-text').value")
    css="""<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:15px/1.6 system-ui;background:#f6f8fc;color:#182238}#messages,#message_list_scroller_id{height:calc(100dvh - 100px);overflow:auto;padding:12px}#chat_footer{display:flex;align-items:center;gap:8px;position:fixed;bottom:0;left:0;right:0;padding:12px;background:white}#chat_footer [aria-label=message-composer]{flex:1;min-width:0}#chat_footer input[type=file]{display:none}#chat_footer textarea{min-width:0;flex:1;min-height:48px;border:1px solid #dce3ef;border-radius:12px;font:inherit;padding:8px}#chat_footer button{padding:12px}#MiddleColumn>[style],#column-center>[style]{position:fixed!important;bottom:0;left:0;right:0;min-height:70px;padding:12px;background:white}[contenteditable=true]{border:1px solid #dce3ef;border-radius:12px;padding:8px;min-height:40px}#messages>div,#message_list_scroller_id>div{margin-block:12px;max-width:90%}</style>"""
    return fixture.replace('<head>','<head>'+css)

def tap_dom(phone,selector):
    phone.evaluate('document.querySelector('+json.dumps(selector)+').scrollIntoView({block:"nearest"})')
    rect=wait(lambda:phone.evaluate('(()=>{const e=document.querySelector('+json.dumps(selector)+');if(!e)return null;const r=e.getBoundingClientRect();return r.width&&r.height?[r.x+r.width/2,r.y+r.height/2]:null})()'))
    # Trusted input into the actual WebView, rather than a DOM click handler.
    phone.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':rect[0],'y':rect[1]}]})
    phone.call('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})

def main():
    assert adb('shell','getprop','ro.kernel.qemu').strip()=='1','Use a test emulator, never a physical account device'
    OUT.mkdir(parents=True,exist_ok=True)
    sample=OUT/'cg-android-upload.txt';sample.write_bytes('Android document picker — سلام\n'.encode()+bytes(range(256)))
    adb('push',str(sample),'/sdcard/Download/'+sample.name)
    adb('shell','rm','-f','/sdcard/Download/cg-android-test-picture.png')
    adb('shell','am','force-stop','com.google.android.permissioncontroller')
    adb('shell','am','force-stop',APP)
    adb('shell','pm','clear',APP)
    adb('shell','pm','revoke',APP,'android.permission.POST_NOTIFICATIONS')
    adb('shell','pm','clear-permission-flags',APP,'android.permission.POST_NOTIFICATIONS','user-set','user-fixed')
    adb('shell','am','start','-W','-n',APP+'/.MainActivity')
    pid=wait(lambda:adb('shell','pidof',APP).strip())
    adb('forward',f'tcp:{PORT}',f'localabstract:webview_devtools_remote_{pid}')
    shell=CDP(wait(lambda:next((t for t in targets() if t['url'].endswith('/index.html')),None)))
    wait(lambda:shell.evaluate('typeof CipherGapHost === "object" && typeof navigate === "function"'))
    shell.evaluate('chrome.storage.local.set({ciphergap_ui_language:"en",ciphergap_enabled:true})')
    state=shell.evaluate('CipherGapHost.request("app_state")')
    assert state['compatible'],state
    shell.evaluate('CipherGapHost.request("notifications",{enabled:false})')
    shell.evaluate('navigate("settings")')
    shell.evaluate('document.getElementById("notifications").click()')
    tap_resource('permission_deny_button')
    wait(lambda:shell.evaluate('document.getElementById("status").textContent.includes("not permitted") && !document.getElementById("notifications").checked'))
    assert not shell.evaluate('document.getElementById("notifications").checked')
    adb('shell','pm','clear-permission-flags',APP,'android.permission.POST_NOTIFICATIONS','user-set','user-fixed')
    shell.evaluate('document.getElementById("notifications").click()')
    tap_resource('permission_allow_button')
    wait(lambda:shell.evaluate('document.getElementById("notifications").checked'))
    print('PASS Android notification permission denial and grant',flush=True)
    for lang,theme in [('en','light'),('fa','dark')]:
        shell.evaluate('chrome.storage.local.set('+json.dumps({'ciphergap_ui_language':lang,'ciphergap_ui_theme':theme})+')')
        wait(lambda:shell.evaluate('document.documentElement.lang')==lang)
        shell.evaluate('navigate("home")')
        assert shell.evaluate('document.documentElement.scrollWidth<=innerWidth')
        shell.evaluate('document.fonts.ready')
        assert shell.evaluate('document.fonts.check("14px Vazirmatn") && document.fonts.check("14px Inter")')
        shell.screenshot('home-'+lang+'.png')
        shell.evaluate('navigate("guide")');assert shell.evaluate('document.querySelectorAll("#guide article").length')==7
        shell.screenshot('guide-'+lang+'.png')
    shell.evaluate('chrome.storage.local.set({ciphergap_ui_language:"en",ciphergap_ui_theme:"light"})')
    profile=tempfile.mkdtemp(prefix='cg-android-desktop-')
    try:
        with sync_playwright() as p:
            desktop=p.chromium.launch_persistent_context(profile,channel='chromium',headless=True,args=[f'--disable-extensions-except={ROOT}/CipherGap',f'--load-extension={ROOT}/CipherGap'],accept_downloads=True)
            worker=desktop.service_workers[0] if desktop.service_workers else desktop.wait_for_event('serviceworker')
            kernel=desktop.new_page();kernel.goto('chrome-extension://'+worker.url.split('/')[2]+'/popup/popup.html')
            kernel.evaluate("""async()=>{for(const f of ['encoding','crypto','file_crypto','dh_crypto','stickers'])await new Promise((r,j)=>{const s=document.createElement('script');s.src='../share/'+f+'.js';s.onload=r;s.onerror=j;document.head.append(s)})}""")
            for platform,base in [('bale','https://web.bale.ai/'),('eitaa','https://web.eitaa.com/'),('telegram','https://web.telegram.org/a/')]:
                fixture=mobile_fixture(platform)
                android_url=base+('chat?uid=601' if platform=='bale' else '#601')
                desktop_url=base+('chat?uid=701' if platform=='bale' else '#701')
                shell.evaluate('CipherGapHost.request("open_messenger",{url:'+json.dumps(android_url)+'})')
                target=wait(lambda:next((t for t in targets() if base.split('/')[2] in t['url']),None))
                phone=CDP(target);phone.navigate_fixture(android_url,fixture)
                peer_fixture=bale_fixture() if platform=='bale' else html(platform)
                desktop.route(base+'**',lambda route,request,body=peer_fixture:route.fulfill(body=body,content_type='text/html'))
                peer=desktop.new_page();peer.goto(desktop_url);peer.wait_for_selector('#ciphergap-toolbar')
                tab=worker.evaluate('base=>chrome.tabs.query({url:base+"*"}).then(t=>t.at(-1).id)',base)
                ctx=shell.evaluate('chrome.tabs.sendMessage(1,{action:"get_chat_context"})')
                peerctx=worker.evaluate('id=>chrome.tabs.sendMessage(id,{action:"get_chat_context"})',tab)
                def action(message):return shell.evaluate('chrome.tabs.sendMessage(1,'+json.dumps(dict(message,expectedStorageKey=ctx['storageKey']))+')')
                def peeraction(message):return worker.evaluate('([id,m])=>chrome.tabs.sendMessage(id,m)',[tab,dict(message,expectedStorageKey=peerctx['storageKey'])])
                # Main-world scripts cannot obtain the key API or Android privileged bridge.
                assert phone.evaluate('({bridge:typeof cgNative,storage:typeof globalThis.chrome?.storage,core:typeof CipherGapShared})')=={'bridge':'undefined','storage':'undefined','core':'undefined'}
                # Regression: an SPA can replace its editor without becoming an unsupported messenger.
                assert phone.evaluate('(()=>{const e=document.querySelector(CipherGapShared.chat_platforms[CipherGapShared.messenger_adapters.resolve_context().messenger].input_selector),p=e.parentElement,n=e.nextSibling;e.remove();const active=!!CipherGapShared.messenger_adapters.get_active();p.insertBefore(e,n);return active})()',isolated=True)
                # Start from the actual local security screen, as a user does.
                shell.evaluate('CipherGapHost.request("open_security")')
                popup=CDP(wait(lambda:next((t for t in targets() if 'popup.html' in t['url']),None)))
                wait(lambda:popup.evaluate('document.getElementById("securityCard")?.dataset.view')=='no-key')
                tap_dom(popup,'#exchangeBtn')
                wait(lambda:phone.evaluate('testSent.some(s=>s.startsWith("start exchange key:"))'))
                status=shell.evaluate('chrome.storage.local.get('+json.dumps('exchange_status_'+ctx['storageKey'])+')')['exchange_status_'+ctx['storageKey']]
                started={'ok':True,'nonce':status['nonce']}
                adb('shell','input','keyevent','4');popup.close()
                request=wait(lambda:phone.evaluate('testSent.at(-1)'));peer.evaluate('s=>addMessage(s)',request)
                peer.locator('[data-ciphergap-exchange-action=accept]').click()
                peer.wait_for_function('testSent.some(s=>s.startsWith("start exchange ack:"))')
                ack=peer.evaluate('testSent.find(s=>s.startsWith("start exchange ack:"))')
                phone.evaluate('addMessage('+json.dumps(ack)+')')
                wait(lambda:phone.evaluate('testSent.some(s=>s.startsWith("cg-sas|"))'))
                ownkey=shell.evaluate('chrome.storage.local.get('+json.dumps(ctx['storageKey'])+')')[ctx['storageKey']]
                other=wait(lambda:worker.evaluate('k=>chrome.storage.local.get(k).then(s=>s[k])',peerctx['storageKey']))
                assert ownkey==other
                assert action({'action':'mark_key_verified','nonce':started['nonce']})['ok']
                assert peeraction({'action':'mark_key_verified','nonce':started['nonce']})['ok']
                time.sleep(.6)  # Native SAS send restores the draft before another send.
                editor='[contenteditable=true][enterkeyhint]' if platform=='eitaa' else '#editable-message-text'
                text='Android ↔ desktop — سلام 👨‍👩‍👧‍👦 👍🏽'
                phone.evaluate('(()=>{const e=document.querySelector('+json.dumps(editor)+');if(e.tagName==="TEXTAREA")e.value='+json.dumps(text)+';else{e.textContent="Android ↔ desktop — سلام ";for(const emoji of ["👨‍👩‍👧‍👦","👍🏽"]){const img=document.createElement("img");img.alt=emoji;img.src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";e.append(img," ")}}e.dispatchEvent(new Event("input",{bubbles:true}))})()')
                wait(lambda:phone.evaluate('(()=>{const a=document.getElementById("ciphergap-toolbar").getBoundingClientRect(),b=document.querySelector("#editable-message-text, [contenteditable=true][enterkeyhint]").getBoundingClientRect();return a.bottom<=b.top && a.left>=0 && a.right<=innerWidth+1})()'))
                assert phone.evaluate('document.getElementById("ciphergap-media")===null')
                tap_dom(phone,'#ciphergap-btn')
                packet=wait(lambda:phone.evaluate('testSent.at(-1)?.startsWith("CGP|") ? testSent.at(-1):null'))
                ident=peer.evaluate('s=>addMessage(s)',packet);peer.locator('.ciphergap-decrypt-button').last.click();peer.locator('.ciphergap-plaintext').last.wait_for()
                assert peer.locator('.ciphergap-plaintext').last.inner_text()==text
                # Reverse direction uses the actual desktop core and native Android message rendering.
                reverse=kernel.evaluate('async([text,key])=>CipherGapShared.protocol.build_ciphergap_packet(await CipherGapShared.crypto.encrypt_message(text,key))',[text,other])
                phone.evaluate('addMessage('+json.dumps(reverse)+')')
                wait(lambda:phone.evaluate('Boolean(document.querySelector(".ciphergap-decrypt-button"))'))
                phone.evaluate('document.querySelector(".ciphergap-decrypt-button").click()')
                wait(lambda:phone.evaluate('document.querySelector(".ciphergap-plaintext")?.textContent')==text)
                assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
                # Real native ACTION_OPEN_DOCUMENT, not DOM.setFileInputFiles.
                phone.evaluate('document.getElementById("ciphergap-secure-files").click()')
                pick_uploaded_file(sample.name)
                captured=wait(lambda:phone.evaluate('received.at(-1)'))
                assert captured['name']==sample.name+'.cgpe'
                assert bytes(captured['bytes']).startswith(b'CGPE') and sample.read_bytes() not in bytes(captured['bytes'])
                file_id=peer.evaluate('a=>addAttachment(a.bytes,a.name.slice(0,-5))',captured)
                peer.locator('.ciphergap-file-decrypt-button').last.click();peer.locator('dialog[data-ciphergap-ui=file-viewer]').wait_for(state='visible')
                with peer.expect_download() as downloaded:peer.locator('.ciphergap-file-viewer__download').click()
                assert Path(downloaded.value.path()).read_bytes()==sample.read_bytes()
                peer.locator('.ciphergap-file-viewer header button').click()
                # The mobile custom picker is removed; desktop stickers still decrypt inline.
                sticker=kernel.evaluate('async key=>{const packed=await CipherGapShared.stickers.pack(new File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="),c=>c.charCodeAt(0))],"native-test.png",{type:"image/png"}));const file=await CipherGapShared.file_crypto.encrypt_file(packed,key);return {name:file.name,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))}}',other)
                phone.evaluate('addAttachment('+json.dumps(sticker['bytes'])+','+json.dumps(sticker['name'][:-5])+')')
                wait(lambda:phone.evaluate('Boolean(document.querySelector(".ciphergap-file-decrypt-button"))'))
                phone.evaluate('Array.from(document.querySelectorAll(".ciphergap-file-decrypt-button")).at(-1).click()')
                wait(lambda:phone.evaluate('Boolean(document.querySelector(".ciphergap-sticker-inline img")?.naturalWidth)'))
                # Authenticated image, sound, video and passive-only unknown file handling.
                for name,mime,raw,kind in media_fixtures(ROOT):
                    name='cg-android-test-'+name
                    upload=kernel.evaluate('async([bytes,name,mime,key])=>{const file=await CipherGapShared.file_crypto.encrypt_file(new File([new Uint8Array(bytes)],name,{type:mime}),key);return Array.from(new Uint8Array(await file.arrayBuffer()))}',[list(raw),name,mime,other])
                    attachment_id=phone.evaluate('addAttachment('+json.dumps(upload)+','+json.dumps(name)+')')
                    row_selector={'bale':'[data-sid="'+attachment_id+'"]','eitaa':'[data-mid="'+attachment_id+'"]','telegram':'#message-'+attachment_id}[platform]
                    button_selector=row_selector+' .ciphergap-file-decrypt-button'
                    wait(lambda:phone.evaluate('Boolean(document.querySelector('+json.dumps(button_selector)+'))'))
                    phone.evaluate('document.querySelector('+json.dumps(button_selector)+').click()')
                    wait(lambda:phone.evaluate('Boolean(document.querySelector("dialog[data-ciphergap-ui=file-viewer][open]"))'))
                    assert phone.evaluate('document.querySelector(".ciphergap-file-viewer h2").textContent')==name
                    if kind=='img':wait(lambda:phone.evaluate('document.querySelector(".ciphergap-file-viewer img")?.naturalWidth')==128)
                    if kind=='img' and platform=='bale':
                        phone.evaluate('document.querySelector(".ciphergap-file-viewer__download").click()')
                        tap_text('Show roots');tap_text('Downloads');tap_resource('button1')
                        wait(lambda:adb('exec-out','cat','/sdcard/Download/'+name,binary=True)==raw)
                    if kind in ('audio','video'):
                        phone.evaluate('document.querySelector(".ciphergap-file-viewer '+kind+'").play()')
                        wait(lambda:phone.evaluate('document.querySelector(".ciphergap-file-viewer '+kind+'").currentTime')>0)
                    if kind=='fallback':assert phone.evaluate('document.querySelectorAll(".ciphergap-file-viewer iframe,.ciphergap-file-viewer object,.ciphergap-file-viewer embed").length')==0
                    phone.evaluate('document.querySelector(".ciphergap-file-viewer header button").click()')
                # Corrupt ciphertext must fail before any preview opens.
                damaged=upload.copy();damaged[-1]^=1
                damaged_id=phone.evaluate('addAttachment('+json.dumps(damaged)+','+json.dumps(name)+')')
                damaged_selector={'bale':'[data-sid="'+damaged_id+'"]','eitaa':'[data-mid="'+damaged_id+'"]','telegram':'#message-'+damaged_id}[platform]+' .ciphergap-file-decrypt-button'
                wait(lambda:phone.evaluate('Boolean(document.querySelector('+json.dumps(damaged_selector)+'))'))
                phone.evaluate('document.querySelector('+json.dumps(damaged_selector)+').click()')
                wait(lambda:phone.evaluate('document.querySelector('+json.dumps(damaged_selector)+').textContent.includes("Try again")'))
                assert not phone.evaluate('Boolean(document.querySelector("dialog[data-ciphergap-ui=file-viewer][open]"))')
                # A past absolute deadline is rejected in the same runtime used by Android.
                expired=request.rsplit('|',1)[0]+'|'+str(int(time.time()*1000)-1000)
                expired_id=phone.evaluate('addMessage('+json.dumps(expired)+')')
                wait(lambda:phone.evaluate('Array.from(document.querySelectorAll(".ciphergap-chat-card__timer")).some(e=>e.textContent.includes("00:00"))'))
                assert action({'action':'respond_key_exchange','nonce':started['nonce'],'accept':True})['ok'] is False
                if platform=='bale':
                    # Reverse the roles and accept on Android's chat card.
                    before=phone.evaluate('testSent.length')
                    reverse_exchange=peeraction({'action':'start_key_exchange'});assert reverse_exchange['ok']
                    invitation=peer.evaluate('testSent.at(-1)')
                    phone.evaluate('addMessage('+json.dumps(invitation)+')')
                    accept='Array.from(document.querySelectorAll("[data-ciphergap-exchange-action=accept]")).at(-1)'
                    wait(lambda:phone.evaluate('Boolean('+accept+') && '+accept+'.closest("[data-ciphergap-ui]").dataset.ciphergapNonce==='+json.dumps(reverse_exchange['nonce'])+' && Boolean('+accept+'.getClientRects().length)'))
                    phone.evaluate(accept+'.click()')
                    phone.evaluate(accept+'.click()')  # Existing-key replacement confirmation.
                    response=wait(lambda:phone.evaluate('testSent.slice('+str(before)+').find(s=>s.startsWith("start exchange ack:"))'))
                    peer.evaluate('s=>addMessage(s)',response)
                    previous=ownkey
                    ownkey=wait(lambda:(lambda state:state.get(ctx['storageKey']) if state.get(ctx['storageKey'])!=previous else None)(shell.evaluate('chrome.storage.local.get('+json.dumps(ctx['storageKey'])+')')))
                    wait(lambda:worker.evaluate('([k,v])=>chrome.storage.local.get(k).then(s=>s[k]===v)',[peerctx['storageKey'],ownkey]))
                    assert action({'action':'mark_key_verified','nonce':reverse_exchange['nonce']})['ok']
                # Duplicate/native history rendering never contains plaintext in a notification.
                notifications=adb('shell','dumpsys','notification','--noredact')
                own_notifications=re.findall(r'NotificationRecord\([^\n]*pkg=com\.ciphergap\.mobile[^\n]*',notifications)
                assert own_notifications
                assert text not in notifications and sample.name not in '\n'.join(own_notifications)
                phone.screenshot(platform+'-chat.png')
                # Pause clears plaintext in the actual DOM, not just a settings flag.
                phone.evaluate('document.getElementById("ciphergap-chat-toggle").click()')
                wait(lambda:phone.evaluate('document.querySelectorAll(".ciphergap-plaintext").length')==0)
                phone.evaluate('document.getElementById("ciphergap-chat-toggle").click()')
                phone.close();peer.close()
                print('PASS Android / desktop '+platform+': ECDH, SAS, text, Unicode emoji, native file authentication, media, pause, isolation',flush=True)
            desktop.close()
    finally:shutil.rmtree(profile,ignore_errors=True)
    # Inspect only synthetic test secrets: the persisted native blob must be encrypted.
    stored=adb('shell','run-as',APP,'cat','shared_prefs/ciphergap_secure.xml')
    assert ownkey not in stored and 'Android ↔ desktop' not in stored
    print('PASS Android private authenticated storage; screenshots in '+str(OUT),flush=True)
    native_checks(shell,ctx['storageKey'],ownkey)
    shell.close()
    notification_checks(request)

def notification_checks(invitation):
    adb('shell','am','start','-W','-n',APP+'/.MainActivity')
    def chat_visible():
        adb('shell','uiautomator','dump','/sdcard/cg-ui.xml')
        root=ET.fromstring(adb('shell','cat','/sdcard/cg-ui.xml'))
        return any(n.get('text')=='Home' and n.get('class')=='android.widget.Button' for n in root.iter('node'))
    def records():
        rows=re.findall(r'NotificationRecord\([^\n]*pkg=com\.ciphergap\.mobile[^\n]*',adb('shell','dumpsys','notification','--noredact'))
        return sorted(r.split(': Notification(')[0] for r in rows if 'GROUP_SUMMARY' not in r)
    shell=CDP(next(t for t in targets() if t['url'].endswith('/index.html')))
    shell.evaluate('chrome.storage.local.set({ciphergap_ui_language:"en",ciphergap_enabled:true});CipherGapHost.request("notifications",{enabled:true})')
    for platform,base in [('bale','https://web.bale.ai/'),('eitaa','https://web.eitaa.com/'),('telegram','https://web.telegram.org/a/')]:
        url=base+('chat?uid=601' if platform=='bale' else '#601')
        shell.evaluate('CipherGapHost.request("open_messenger",{url:'+json.dumps(url)+'})')
        phone=CDP(wait(lambda:next((t for t in targets() if base.split('/')[2] in t['url']),None)))
        phone.navigate_fixture(url,bale_fixture() if platform=='bale' else html(platform));time.sleep(1.1)
        initial=records();ident=phone.evaluate('addMessage("private notification probe")')
        wait(lambda:len(records())==len(initial)+1);time.sleep(.8);current=records()
        selector={'bale':'[data-sid="'+ident+'"]','eitaa':'[data-mid="'+ident+'"]','telegram':'#message-'+ident}[platform]
        phone.evaluate('(()=>{const e=document.querySelector('+json.dumps(selector)+');e.after(e.cloneNode(true));addMessage("outgoing",false);const id=addMessage("history");const r=document.getElementById("message-"+id)||document.querySelector("[data-sid=\\""+id+"\\"],[data-mid=\\""+id+"\\"]");r.dataset.date="1";r.dataset.timestamp="1";if(r.dataset.messageId)r.dataset.messageId="1";})()')
        time.sleep(.3);assert records()==current
        phone.evaluate('addMessage('+json.dumps(invitation)+')');wait(lambda:len(records())==len(current)+1)
        dump=adb('shell','dumpsys','notification','--noredact')
        assert 'New key exchange request' in dump and 'private notification probe' not in dump
        if platform=='bale':
            tap_text('Home');assert not chat_visible()
            adb('shell','cmd','statusbar','expand-notifications');time.sleep(1)
            adb('shell','uiautomator','dump','/sdcard/cg-ui.xml')
            tree=ET.fromstring(adb('shell','cat','/sdcard/cg-ui.xml'))
            # Android can auto-group notifications. Expand the CipherGap group
            # before tapping an individual notification with its chat intent.
            groups=[n for n in tree.iter('node') if {e.get('text') for e in n.findall(".//node[@resource-id='android:id/app_name_text']")}=={'CipherGap'} and n.find(".//node[@resource-id='android:id/expand_button_number']") is not None]
            if groups:
                group=min(groups,key=lambda n:len(list(n.iter())))
                badge=group.find(".//node[@resource-id='android:id/expand_button_number']")
                a,b,c,d=map(int,re.findall(r'\d+',badge.get('bounds')))
                adb('shell','input','tap',str((a+c)//2),str((b+d)//2));time.sleep(.5)
            tap_text('New key exchange request')
            wait(chat_visible)
        adb('shell','input','keyevent','3')
        wait(lambda:'mResumed=false mStopped=true' in adb('shell','dumpsys','activity',APP))
        current=records()
        phone.evaluate('addMessage("background")');time.sleep(.3);assert records()==current
        adb('shell','am','start','-W','-n',APP+'/.MainActivity');phone.close()
    shell.evaluate('CipherGapHost.request("clear_browser");void 0');tap_text('Clear data');shell.close()
    print('PASS native notifications: generic text/exchange, no history/outgoing/duplicates or background delivery',flush=True)

def native_checks(shell,key,secret):
    phone=CDP(next(t for t in targets() if 'web.telegram' in t['url']))
    shell.evaluate('chrome.storage.local.set({ciphergap_ui_language:"en",ciphergap_ui_theme:"light"})')
    shell.evaluate('CipherGapHost.request("open_security")')
    security=CDP(wait(lambda:next((t for t in targets() if 'popup.html' in t['url']),None)))
    wait(lambda:security.evaluate('document.getElementById("securityCard")?.dataset.view')=='verified')
    assert security.evaluate('document.documentElement.scrollWidth<=innerWidth')
    security.screenshot('security-en.png')
    shell.evaluate('chrome.storage.local.set({ciphergap_ui_language:"fa",ciphergap_ui_theme:"dark"})')
    wait(lambda:security.evaluate('document.documentElement.lang')=='fa')
    assert security.evaluate('document.getElementById("verifiedDescription").textContent').startswith('کلید')
    security.screenshot('security-fa.png')
    shell.evaluate('chrome.storage.local.set({ciphergap_ui_language:"en",ciphergap_ui_theme:"light"})')
    security.evaluate('document.getElementById("nav-settings").click();document.getElementById("autoDecryptToggle").click()')
    wait(lambda:security.evaluate('document.getElementById("autoDecryptToggle").checked && !document.getElementById("autoDecryptToggle").disabled'))
    security.evaluate('document.getElementById("autoDecryptToggle").click()')
    wait(lambda:security.evaluate('!document.getElementById("autoDecryptToggle").checked && !document.getElementById("autoDecryptToggle").disabled'))
    # Android Back returns from security to the existing conversation.
    adb('shell','input','keyevent','4');time.sleep(.3)
    phone.evaluate('document.cookie="cg_session_probe=persisted;Secure;SameSite=Strict;path=/"')
    phone.evaluate('document.getElementById("editable-message-text").scrollIntoView()')
    # Real touch opens the Android keyboard, instead of synthesizing a JS focus.
    rect=phone.evaluate('(()=>{const r=document.getElementById("editable-message-text").getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,devicePixelRatio]})()')
    adb('shell','uiautomator','dump','/sdcard/cg-ui.xml')
    nodes=ET.fromstring(adb('shell','cat','/sdcard/cg-ui.xml'))
    web=next(n for n in nodes.iter('node') if n.get('class')=='android.webkit.WebView')
    left,top,_,_=map(int,re.findall(r'\d+',web.get('bounds')))
    adb('shell','input','tap',str(int(left+rect[0]*rect[2])),str(int(top+rect[1]*rect[2])))
    wait(lambda:'mInputShown=true' in adb('shell','dumpsys','input_method'))
    phone.screenshot('keyboard.png');adb('shell','input','keyevent','4')
    # Keystore data and a synthetic session cookie survive a process restart.
    adb('shell','input','keyevent','3');time.sleep(.2)
    phone.close();security.close();shell.close()
    adb('shell','am','force-stop',APP);adb('shell','am','start','-W','-n',APP+'/.MainActivity')
    pid=wait(lambda:adb('shell','pidof',APP).strip());adb('forward',f'tcp:{PORT}',f'localabstract:webview_devtools_remote_{pid}')
    shell=CDP(wait(lambda:next((t for t in targets() if t['url'].endswith('/index.html')),None)))
    wait(lambda:shell.evaluate('typeof CipherGapHost')=='object')
    assert shell.evaluate('chrome.storage.local.get('+json.dumps(key)+')')[key]==secret
    shell.evaluate('CipherGapHost.request("open_messenger",{url:"https://web.telegram.org/a/#601"})')
    phone=CDP(wait(lambda:next((t for t in targets() if 'web.telegram' in t['url']),None)))
    phone.navigate_fixture('https://web.telegram.org/a/#601',html('telegram'))
    assert 'cg_session_probe=persisted' in phone.evaluate('document.cookie')
    # Clear-data cancellation preserves the key; confirmation removes all keys.
    shell.evaluate('navigate("settings");CipherGapHost.request("clear_browser").then(v=>window.clearResult=v);void 0')
    tap_text('Cancel');wait(lambda:shell.evaluate('window.clearResult === false'))
    assert shell.evaluate('chrome.storage.local.get('+json.dumps(key)+')')[key]==secret
    shell.evaluate('CipherGapHost.request("open_security")')
    security=CDP(wait(lambda:next((t for t in targets() if 'popup.html' in t['url']),None)))
    wait(lambda:security.evaluate('document.getElementById("securityCard")?.dataset.view')=='verified')
    security.evaluate('document.getElementById("nav-settings").click();document.getElementById("manageKeyDetails").open=true;document.getElementById("clearKeyBtn").click()')
    wait(lambda:security.evaluate('document.getElementById("confirmationDialog").open'))
    security.evaluate('document.getElementById("confirmationCancelBtn").click()')
    time.sleep(.2)  # A dialog close event is queued separately from its submit click.
    assert shell.evaluate('chrome.storage.local.get('+json.dumps(key)+')')[key]==secret
    security.evaluate('document.getElementById("clearKeyBtn").click()')
    wait(lambda:security.evaluate('document.getElementById("confirmationDialog").open'))
    security.evaluate('document.getElementById("confirmationActionBtn").click()')
    wait(lambda:shell.evaluate('chrome.storage.local.get('+json.dumps(key)+')')=={})
    security.close()
    shell.evaluate('chrome.storage.local.set({android_clear_probe:"keep"})')
    shell.evaluate('window.clearResult=null;CipherGapHost.request("clear_browser").then(v=>window.clearResult=v);void 0')
    tap_text('Clear data')
    wait(lambda:shell.evaluate('typeof CipherGapHost')=='object' and shell.evaluate('chrome.storage.local.get("android_clear_probe")')=={})
    shell.close();phone.close()
    print('PASS Android security settings, keyboard, Back, session/key persistence and confirmed data clearing',flush=True)

if __name__=='__main__':main()
