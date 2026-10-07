"""Real Chromium extension: encrypted backup UI, QR image/camera and exact keys."""
from pathlib import Path
import base64
import json
import shutil
import subprocess
import tempfile
from playwright.sync_api import sync_playwright
from messenger_fixtures import html

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="cg-transfer-") as folder:
    folder = Path(folder)
    secret = "کلید انتقال 🔐 + / = 123456789"
    packet = "ciphergap-key:1:" + base64.b64encode(secret.encode()).decode()
    # A synthetic camera feed carries the same payload as the real popup QR.
    ppm = folder / "qr.ppm"
    script = """const fs=require('fs'),qr=require(process.argv[1])(0,'M');qr.addData(process.argv[2]);qr.make();const w=(qr.getModuleCount()+8)*8,buf=Buffer.alloc(w*w*3);for(let y=0;y<w;y++)for(let x=0;x<w;x++){const r=Math.floor(y/8)-4,c=Math.floor(x/8)-4,v=r>=0&&c>=0&&r<qr.getModuleCount()&&c<qr.getModuleCount()&&qr.isDark(r,c)?0:255;buf.fill(v,(y*w+x)*3,(y*w+x)*3+3)}fs.writeFileSync(process.argv[3],Buffer.concat([Buffer.from(`P6\\n${w} ${w}\\n255\\n`),buf]));"""
    subprocess.run(["node", "-e", script, str(root / "CipherGap/share/vendor/qrcode.js"), packet, str(ppm)], check=True)
    feed = folder / "qr.y4m"
    subprocess.run(["ffmpeg","-loglevel","error","-loop","1","-i",str(ppm),"-t","2","-vf","scale=640:480","-pix_fmt","yuv420p","-f","yuv4mpegpipe",str(feed)],check=True)
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(str(folder / "profile"), channel="chromium", headless=True, accept_downloads=True, viewport={"width":440,"height":590},
            args=[f"--disable-extensions-except={root}/CipherGap",f"--load-extension={root}/CipherGap","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",f"--use-file-for-fake-video-capture={feed}"])
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        errors = []
        ctx.route("https://web.eitaa.com/**",lambda route:route.fulfill(body=html("eitaa"),content_type="text/html"))
        chat = ctx.new_page();chat.goto("https://web.eitaa.com/#601");chat.wait_for_selector("#ciphergap-toolbar")
        tab = worker.evaluate("()=>chrome.tabs.query({url:'https://web.eitaa.com/*'}).then(t=>t[0].id)")
        key_id = "web.eitaa.com_601"
        original = {key_id:secret,"web.bale.ai_123":"other key",key_id+"__auto_decrypt":True,key_id+"__auto_files":False,"ciphergap_ui_theme":"dark","ciphergap_ui_language":"en", "key_trust_"+key_id:{"state":"verified","source":"exchange","fingerprint":"1234abcd","at":123}}
        worker.evaluate("values=>chrome.storage.local.set(values)",original)
        popup = ctx.new_page();popup.on("pageerror",lambda error:errors.append(str(error)))
        popup.goto(worker.url.rsplit("/",1)[0]+f"/popup/popup.html?tabId={tab}")
        popup.wait_for_selector("#keyTrustBadge[data-tone=success]")
        popup.locator("#nav-transfer").click()
        popup.locator("#backupPassword").fill("backup password 123")
        with popup.expect_download() as download:popup.locator("#exportAllBtn").click()
        backup = Path(download.value.path()).read_bytes();assert secret.encode() not in backup
        popup.locator("#backupPassword").fill("backup password 123")
        with popup.expect_download() as download:popup.locator("#exportChatBtn").click()
        single = Path(download.value.path()).read_bytes()
        popup.locator("#shareQrBtn").click();popup.locator("#confirmationActionBtn").click();popup.locator("#qrDialog[open]").wait_for()
        with popup.expect_download() as download:popup.locator("#saveQrBtn").click()
        image = Path(download.value.path()).read_bytes()
        popup.locator("#qrDialog form button").click()
        popup.wait_for_function("() => document.getElementById('keyQrCanvas').width===0")
        worker.evaluate("key=>chrome.storage.local.set({[key]:'changed key'})",key_id)
        popup.locator("#backupPassword").fill("wrong password 123")
        popup.wait_for_selector("#importBackupBtn:not([aria-busy])")
        popup.locator("#backupFileInput").set_input_files({"name":"backup.ciphergap","mimeType":"application/json","buffer":backup})
        popup.wait_for_function("() => document.getElementById('statusText').textContent.includes('Wrong password')")
        assert worker.evaluate("key=>chrome.storage.local.get(key).then(s=>s[key])",key_id)=="changed key"
        popup.locator("#backupPassword").fill("backup password 123")
        popup.wait_for_selector("#importBackupBtn:not([aria-busy])")
        popup.locator("#backupFileInput").set_input_files({"name":"backup.ciphergap","mimeType":"application/json","buffer":backup})
        popup.locator("#confirmationDialog[open]").wait_for();popup.locator("#confirmationCancelBtn").click()
        assert worker.evaluate("key=>chrome.storage.local.get(key).then(s=>s[key])",key_id)=="changed key"
        popup.wait_for_selector("#importBackupBtn:not([aria-busy])")
        popup.locator("#backupFileInput").set_input_files({"name":"backup.ciphergap","mimeType":"application/json","buffer":backup})
        popup.locator("#confirmationActionBtn").click();popup.wait_for_function("() => document.getElementById('statusText').textContent==='Import complete.'")
        restored = worker.evaluate("names=>chrome.storage.local.get(names)",list(original))
        assert restored==original,(restored,original)

        chat.goto("https://web.eitaa.com/#602");chat.wait_for_timeout(200)
        popup.reload();popup.wait_for_selector("#noKeyPanel",state="visible");popup.locator("#nav-transfer").click()
        popup.locator("#importTarget").select_option("current");popup.locator("#backupPassword").fill("backup password 123")
        popup.wait_for_selector("#importBackupBtn:not([aria-busy])")
        popup.locator("#backupFileInput").set_input_files({"name":"chat.ciphergap","mimeType":"application/json","buffer":single})
        popup.locator("#confirmationActionBtn").click();popup.wait_for_function("() => document.getElementById('statusText').textContent.includes('Key imported')")
        popup.wait_for_selector("#importBackupBtn:not([aria-busy])")
        peer_id="web.eitaa.com_602"
        peer=worker.evaluate("key=>chrome.storage.local.get([key,'key_trust_'+key])",peer_id)
        assert peer[peer_id]==secret and peer["key_trust_"+peer_id]["state"]=="unverified"
        worker.evaluate("key=>chrome.storage.local.set({[key]:'replace using image'})",peer_id)
        popup.locator("#qrImageInput").set_input_files({"name":"key.png","mimeType":"image/png","buffer":image})
        popup.locator("#confirmationActionBtn").click();popup.wait_for_function("() => document.getElementById('statusText').textContent.includes('Key imported')")
        popup.wait_for_selector("#readQrImageBtn:not([aria-busy])")
        assert worker.evaluate("key=>chrome.storage.local.get(key).then(s=>s[key])",peer_id)==secret
        worker.evaluate("key=>chrome.storage.local.set({[key]:'replace using camera'})",peer_id)
        popup.locator("#scanQrBtn").click();popup.locator("#confirmationDialog[open]").wait_for(timeout=20000)
        assert popup.evaluate("document.getElementById('qrVideo').srcObject===null")
        popup.locator("#confirmationActionBtn").click();popup.wait_for_function("() => document.getElementById('statusText').textContent.includes('Key imported')")
        popup.wait_for_selector("#scanQrBtn:not([aria-busy])")
        assert worker.evaluate("key=>chrome.storage.local.get(key).then(s=>s[key])",peer_id)==secret
        # Export/import remain available while paused; navigation works in RTL.
        worker.evaluate("()=>chrome.storage.local.set({ciphergap_enabled:false})")
        popup.wait_for_selector("#pauseNotice",state="visible");assert popup.locator("#exportChatBtn").is_enabled()
        for lang in ["en","fa"]:
            popup.select_option("#languageSelect",lang);popup.wait_for_function("lang=>document.documentElement.lang===lang",arg=lang)
            for theme in ["light","dark"]:
                worker.evaluate("theme=>chrome.storage.local.set({ciphergap_ui_theme:theme})",theme)
                popup.wait_for_function("theme=>document.documentElement.dataset.theme===theme",arg=theme)
                for section in ["security","files","transfer","settings","help"]:
                    popup.locator("#nav-"+section).click()
                    assert popup.locator('[role=tabpanel]:visible').count()==1
                    assert popup.evaluate("document.documentElement.scrollWidth<=innerWidth")
                popup.locator("#nav-transfer").click();popup.locator("#page-transfer").evaluate("e=>e.scrollTop=0");popup.screenshot(path=f"/tmp/ciphergap-transfer-{lang}-{theme}.png")
            popup.locator("#nav-security").focus();popup.keyboard.press("ArrowLeft" if lang=="fa" else "ArrowRight")
            assert popup.locator("#nav-files").get_attribute("aria-selected")=="true"
        assert popup.locator('a[href="https://www.coffeete.ir/alisharify7"]').count()==1
        popup.locator('#nav-help').click()
        for href in ['https://alisharify7.github.io/CipherGap/','https://github.com/alisharify7/CipherGap']:
            link=popup.locator('#page-help a[href="'+href+'"]');assert link.is_visible() and link.get_attribute('rel')=='noopener noreferrer'
        assert not errors,errors
        ctx.close()
print("PASS exact full/chat backups, wrong password/cancel, partner trust, QR image/camera, pause, five tabs, EN/FA and light/dark UI")
