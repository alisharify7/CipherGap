"""Capture current desktop extension and real Android APK with synthetic chat data."""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--desktop', type=Path, required=True)
p.add_argument('--android', type=Path, required=True)
args = p.parse_args()
OUT = ROOT / 'website/screenshots'; OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(args.desktop / 'tests'))
from messenger_fixtures import html
key_id = 'web.eitaa.com_777001'
verified_at = int(datetime.now(timezone.utc).timestamp() * 1000)
def state(language):
    return {key_id:'synthetic-demo-key-never-used-in-a-live-account',key_id+'__auto_decrypt':True,
            'ciphergap_ui_language':language,'ciphergap_ui_theme':'light','ciphergap_enabled':True,
            'key_trust_'+key_id:{'state':'verified','source':'exchange','fingerprint':'1234abcd','at':verified_at,'verifiedAt':verified_at}}
with tempfile.TemporaryDirectory(prefix='ciphergap-site-shots-') as profile, sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(profile,channel='chromium',headless=True,
        viewport={'width':440,'height':590},args=[f'--disable-extensions-except={args.desktop}/CipherGap',f'--load-extension={args.desktop}/CipherGap'])
    ctx.route('https://web.eitaa.com/**',lambda route:route.fulfill(body=html('eitaa'),content_type='text/html'))
    worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
    chat = ctx.new_page();chat.goto('https://web.eitaa.com/#777001');chat.wait_for_selector('#ciphergap-toolbar')
    tab = worker.evaluate('chrome.tabs.query({url:"https://web.eitaa.com/*"}).then(t=>t[0].id)')
    worker.evaluate('s=>chrome.storage.local.set(s)',state('fa'))
    popup = ctx.new_page();popup.goto(worker.url.rsplit('/',1)[0]+f'/popup/popup.html?tabId={tab}')
    popup.wait_for_function('() => document.getElementById("securityCard").dataset.view === "verified"')
    for language in ['fa','en']:
        worker.evaluate('s=>chrome.storage.local.set(s)',state(language))
        popup.wait_for_function('l=>document.documentElement.lang===l',arg=language)
        for name in ['security','files','transfer']:
            popup.locator('#nav-'+name).click()
            popup.locator('#page-'+name).evaluate('e=>e.scrollTop=0')
            popup.screenshot(path=str(OUT/f'desktop-{name}-{language}.png'))
    ctx.close()

sys.path.insert(0, str(args.android / 'tests'))
from browser_android import APP, PORT, CDP, adb, wait, targets, mobile_fixture
assert adb('shell','getprop','ro.kernel.qemu').strip() == '1', 'Only use a disposable emulator'
assert 'CipherGapTransfer' in adb('emu','avd','name'), 'Use the dedicated screenshot/test emulator'
apk = args.android/'android/app/build/outputs/apk/debug/app-debug.apk'
adb('install','-r',str(apk));adb('shell','am','force-stop',APP);adb('shell','pm','clear',APP)
adb('shell','am','start','-W','-n',APP+'/.MainActivity')
pid = wait(lambda:adb('shell','pidof',APP).strip());adb('forward',f'tcp:{PORT}',f'localabstract:webview_devtools_remote_{pid}')
shell = CDP(wait(lambda:next((t for t in targets() if t['url'].endswith('/index.html')),None)))
wait(lambda:shell.evaluate('typeof CipherGapHost')=='object')
assert shell.evaluate('CipherGapHost.request("app_state")')['compatible']
for language in ['fa','en']:
    shell.evaluate('chrome.storage.local.set('+json.dumps(state(language))+')')
    shell.evaluate('navigate("home")')
    wait(lambda:shell.evaluate('document.documentElement.lang')==language)
    shell.evaluate('document.fonts.ready')
    shell.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    (OUT/f'android-home-{language}.png').write_bytes(adb('exec-out','screencap','-p',binary=True))
shell.evaluate('CipherGapHost.request("open_messenger",{url:"https://web.eitaa.com/#777001"})')
phone = CDP(wait(lambda:next((t for t in targets() if 'web.eitaa.com' in t['url']),None)))
phone.navigate_fixture('https://web.eitaa.com/#777001',mobile_fixture('eitaa'))
shell.evaluate('CipherGapHost.request("open_security")')
popup = CDP(wait(lambda:next((t for t in targets() if 'popup.html' in t['url']),None)))
wait(lambda:popup.evaluate('document.getElementById("securityCard").dataset.view')=='verified')
for language in ['fa','en']:
    shell.evaluate('chrome.storage.local.set('+json.dumps(state(language))+')')
    wait(lambda:popup.evaluate('document.documentElement.lang')==language)
    for name in ['security','transfer']:
        popup.evaluate('document.getElementById("nav-'+name+'").click();window.scrollTo(0,0);document.querySelector(".topbar").scrollIntoView()')
        popup.evaluate('document.fonts.ready')
        # Wait for two rendered frames before capturing native compositor pixels.
        popup.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        (OUT/f'android-{name}-{language}.png').write_bytes(adb('exec-out','screencap','-p',binary=True))
popup.close();phone.close();shell.close()
def commit(root):return subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
manifest = json.loads((args.desktop/'CipherGap/manifest.json').read_text())
record = {'captured_at':datetime.now(timezone.utc).isoformat(),'desktop_version':manifest['version'],
          'desktop_commit':commit(args.desktop),'android_commit':commit(args.android),'android_version':'0.1.3',
          'apk_sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),
          'environment':'Real Chromium extension and Android 16/API36 emulator; synthetic chat data, no live accounts',
          'screenshots':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(OUT.glob('*.png'))}}
(OUT/'provenance.json').write_text(json.dumps(record,indent=2)+'\n')
print('Captured current desktop and Android interfaces:',len(record['screenshots']),flush=True)
