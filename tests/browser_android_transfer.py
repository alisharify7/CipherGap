"""Exact desktop ↔ real Android WebView backup/QR transfers on a test emulator."""
import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_android import APP, ROOT, PORT, CDP, adb, wait, targets, mobile_fixture, tap_dom as native_tap, tap_resource, tap_text, pick_uploaded_file

def tap_dom(page, selector):
    # Center controls away from the mobile sticky tabs before trusted touch.
    page.evaluate('document.querySelector('+json.dumps(selector)+').scrollIntoView({block:"center"})')
    native_tap(page,selector)

assert adb('shell','getprop','ro.kernel.qemu').strip() == '1', 'Use a test emulator'
adb('shell','am','force-stop',APP)
adb('shell','pm','clear',APP)
adb('shell','rm','-f','/sdcard/Download/ciphergap-backup.ciphergap','/sdcard/Download/ciphergap-key.png')
adb('shell','am','start','-W','-n',APP+'/.MainActivity')
pid = wait(lambda: adb('shell','pidof',APP).strip())
adb('forward',f'tcp:{PORT}',f'localabstract:webview_devtools_remote_{pid}')
shell = CDP(wait(lambda: next((t for t in targets() if t['url'].endswith('/index.html')),None)))
wait(lambda: shell.evaluate('typeof CipherGapHost === "object"'))
assert shell.evaluate('CipherGapHost.request("app_state")')['compatible']
shell.evaluate('chrome.storage.local.set({ciphergap_ui_language:"en",ciphergap_enabled:true})')
shell.evaluate('CipherGapHost.request("open_messenger",{url:"https://web.eitaa.com/#601"})')
phone = CDP(wait(lambda: next((t for t in targets() if 'web.eitaa.com' in t['url']),None)))
phone.navigate_fixture('https://web.eitaa.com/#601',mobile_fixture('eitaa'))
shell.evaluate('CipherGapHost.request("open_security")')
popup = CDP(wait(lambda: next((t for t in targets() if 'popup.html' in t['url']),None)))
wait(lambda: popup.evaluate('document.getElementById("securityCard").dataset.view') == 'no-key')
tap_dom(popup,'#nav-transfer')
wait(lambda: not popup.evaluate('document.getElementById("page-transfer").hidden'))
secret = 'انتقال واقعی Android ↔ Chrome 🔐 + / = 123456789'
key_id = 'web.eitaa.com_601'
state = {key_id:secret, 'web.bale.ai_123':'second key',key_id+'__auto_decrypt':True,key_id+'__auto_files':False,'ciphergap_ui_language':'en','ciphergap_ui_theme':'dark','ciphergap_enabled':True,'key_trust_'+key_id:{'state':'verified','source':'exchange','fingerprint':'1234abcd','at':123,'verifiedAt':124}}
with tempfile.TemporaryDirectory(prefix='cg-android-transfer-desktop-') as folder, sync_playwright() as pw:
    desktop = pw.chromium.launch_persistent_context(folder,channel='chromium',headless=True,args=[f'--disable-extensions-except={ROOT}/CipherGap',f'--load-extension={ROOT}/CipherGap'])
    worker = desktop.service_workers[0] if desktop.service_workers else desktop.wait_for_event('serviceworker')
    kernel = desktop.new_page(); kernel.goto(worker.url.rsplit('/',1)[0]+'/popup/popup.html')
    kernel.evaluate("""async()=>{const s=document.createElement('script');s.src='../share/crypto.js';await new Promise(r=>{s.onload=r;document.head.append(s)})}""")
    sealed = kernel.evaluate('state=>CipherGapShared.key_transfer.seal(CipherGapShared.key_transfer.snapshot(state),"backup password 123")',state)
    backup = Path(folder)/'cg-transfer.ciphergap'; backup.write_text(sealed)
    adb('push',str(backup),'/sdcard/Download/cg-transfer.ciphergap')
    popup.evaluate('document.getElementById("backupPassword").value="backup password 123"')
    tap_dom(popup,'#importBackupBtn'); pick_uploaded_file('cg-transfer.ciphergap')
    wait(lambda: popup.evaluate('document.getElementById("confirmationDialog").open'))
    tap_dom(popup,'#confirmationActionBtn')
    wait(lambda: popup.evaluate('document.getElementById("statusText").textContent') == 'Import complete.')
    stored = shell.evaluate('chrome.storage.local.get('+json.dumps(list(state))+')')
    assert stored == state,(stored,state)
    # Real cryptographic operations on each device use the transferred key.
    text = 'Android and web restored the exact key — سلام 👨‍👩‍👧‍👦'
    packet = kernel.evaluate('async([text,key])=>CipherGapShared.protocol.build_ciphergap_packet(await CipherGapShared.crypto.encrypt_message(text,key))',[text,secret])
    sid = phone.evaluate('addMessage('+json.dumps(packet)+')')
    wait(lambda: phone.evaluate('Boolean(document.querySelector(".ciphergap-plaintext"))'))
    assert phone.evaluate('document.querySelector(".ciphergap-plaintext").textContent') == text
    back = popup.evaluate('CipherGapShared.key_transfer.seal(CipherGapShared.key_transfer.snapshot('+json.dumps(stored)+'),"backup password 123")')
    recovered = kernel.evaluate('text=>CipherGapShared.key_transfer.open(text,"backup password 123")',back)
    assert recovered['data'] == state
    from_phone = phone.evaluate('CipherGapShared.crypto.encrypt_message('+json.dumps(text)+','+json.dumps(secret)+')',isolated=True)
    assert kernel.evaluate('([cipher,key])=>CipherGapShared.crypto.decrypt_message(cipher,key)',[from_phone,recovered['data'][key_id]]) == text
    print('PASS desktop backup imported by Android native picker; exact keys/settings/trust; both directions decrypt',flush=True)

    popup.evaluate('document.getElementById("backupPassword").value="backup password 123"')
    exported_state=popup.evaluate('chrome.storage.local.get(null).then(s=>CipherGapShared.key_transfer.snapshot(s).data)')
    tap_dom(popup,'#exportAllBtn');tap_text('Save')
    wait(lambda:int(adb('shell','wc','-c','/sdcard/Download/ciphergap-backup.ciphergap').split()[0]) > 0)
    native_backup=Path(folder)/'android-backup.ciphergap';adb('pull','/sdcard/Download/ciphergap-backup.ciphergap',str(native_backup))
    assert kernel.evaluate('text=>CipherGapShared.key_transfer.open(text,"backup password 123")',native_backup.read_text())['data'] == exported_state
    print('PASS Android full backup exported through native save UI and restored by desktop',flush=True)

    wait(lambda:popup.evaluate('document.hasFocus()'))
    tap_dom(popup,'#shareQrBtn')
    wait(lambda:popup.evaluate('document.getElementById("confirmationDialog").open'))
    tap_dom(popup,'#confirmationActionBtn')
    wait(lambda: popup.evaluate('document.getElementById("qrDialog").open'))
    packet = popup.evaluate('(()=>{const c=document.getElementById("keyQrCanvas"),p=c.getContext("2d").getImageData(0,0,c.width,c.height);return jsQR(p.data,p.width,p.height).data})()')
    assert kernel.evaluate('p=>CipherGapShared.key_transfer.read_key(p)',packet) == secret
    # Save through Android's own document UI, then verify exact decoded bytes.
    tap_dom(popup,'#saveQrBtn')
    tap_text('Save')
    wait(lambda: int(adb('shell','wc','-c','/sdcard/Download/ciphergap-key.png').split()[0]) > 0)
    image = Path(folder)/'android-key.png';adb('pull','/sdcard/Download/ciphergap-key.png',str(image))
    assert image.read_bytes().startswith(b'\x89PNG')
    popup.evaluate('document.getElementById("qrDialog").close()')
    wait(lambda: popup.evaluate('document.getElementById("keyQrCanvas").width') == 0)

    phone.call('Fetch.disable');phone.navigate_fixture('https://web.eitaa.com/#602',mobile_fixture('eitaa'))
    shell.evaluate('CipherGapHost.request("open_security")')
    wait(lambda: popup.evaluate('document.getElementById("noKeyPanel").hidden') is False)
    tap_dom(popup,'#nav-transfer');tap_dom(popup,'#readQrImageBtn');pick_uploaded_file('ciphergap-key.png')
    wait(lambda:popup.evaluate('document.getElementById("confirmationDialog").open'));tap_dom(popup,'#confirmationActionBtn')
    peer_id='web.eitaa.com_602'
    wait(lambda:shell.evaluate('chrome.storage.local.get('+json.dumps(peer_id)+')').get(peer_id)==secret)
    assert shell.evaluate('chrome.storage.local.get("key_trust_'+peer_id+'")')['key_trust_'+peer_id]['state']=='unverified'
    print('PASS Android QR generated/saved, decoded on desktop and imported from native image picker without copying sender trust',flush=True)

    # Camera permission is scoped to trusted local UI; close releases tracks.
    adb('shell','pm','clear-permission-flags',APP,'android.permission.CAMERA','user-set','user-fixed')
    tap_dom(popup,'#scanQrBtn');tap_resource('permission_deny_button')
    wait(lambda:popup.evaluate('document.getElementById("statusText").textContent.includes("Camera unavailable")'))
    adb('shell','pm','clear-permission-flags',APP,'android.permission.CAMERA','user-set','user-fixed')
    tap_dom(popup,'#scanQrBtn');tap_resource('permission_allow_foreground_only_button')
    wait(lambda:popup.evaluate('Boolean(document.getElementById("qrVideo").srcObject)'))
    wait(lambda:popup.evaluate('document.getElementById("statusText").textContent') == '')
    popup.evaluate('window.cameraTrack=document.getElementById("qrVideo").srcObject.getVideoTracks()[0];document.getElementById("scannerDialog").close()')
    wait(lambda:popup.evaluate('cameraTrack.readyState')=='ended')
    assert phone.evaluate('navigator.mediaDevices.getUserMedia({video:true}).then(()=>false,()=>true)')
    assert phone.evaluate('typeof cgNative')=='undefined'
    for language,theme in [('en','light'),('fa','dark')]:
        popup.evaluate('chrome.storage.local.set('+json.dumps({'ciphergap_ui_language':language,'ciphergap_ui_theme':theme})+')')
        wait(lambda:popup.evaluate('document.documentElement.lang')==language)
        assert popup.evaluate('document.documentElement.scrollWidth<=innerWidth')
        popup.screenshot('transfer-'+language+'.png')
    print('PASS Android camera denial/grant, track cleanup, messenger camera denial and EN/FA layout',flush=True)
    desktop.close()
popup.close();phone.close();shell.close()
