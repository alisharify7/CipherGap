"""Record the CipherGap demo against the LOCAL mock messenger fixtures.

Never touches real messengers or your own browser profile. Two chats of the
mock Telegram Web A page (tests/messenger_fixtures.py) run in a throw-away
Chromium profile with the unpacked extension from CipherGap/. Screenshots of
both sides are composed into captioned frames and encoded to WebM and GIF.

Setup (once):
  python3 -m venv .venv && .venv/bin/pip install playwright pillow
  .venv/bin/playwright install chromium ffmpeg
Run from the repository root:
  .venv/bin/python docs/demo/record_demo.py      # writes docs/demo/*
FFMPEG=/path/to/ffmpeg overrides the binary. Playwright's bundled build can
write VP9/WebM only; a full ffmpeg could also produce MP4.
"""
import base64, glob, html, os, shutil, subprocess, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
out = Path(__file__).resolve().parent
sys.path.insert(0, str(root / 'tests'))
from messenger_fixtures import html as fixture_html  # noqa: E402

STYLE = '''<style>
body{font:15px system-ui,sans-serif;background:#e9eee3;margin:0;padding:12px}
#messages{height:250px;overflow:auto;background:#fff;border-radius:12px;padding:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px}
#messages>div{max-width:92%}
#messages>div>div>div{background:#eef3e8;padding:8px 12px;border-radius:12px}
[contenteditable]{background:#fff;border:1px solid #cdd7c8;border-radius:10px;padding:8px 12px;min-height:24px}
button{border-radius:8px;border:1px solid #bcc9b5;background:#fff}
#attach-menu-button,#attach-menu-controls,#native-send{display:none}
</style>'''
W, H = 520, 560


def find_ffmpeg():
    found = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if found:
        return found
    return glob.glob(os.path.expanduser('~/Library/Caches/ms-playwright/ffmpeg-*/ffmpeg-mac'))[0]


def page_html():
    h = fixture_html('telegram').replace('<style>', STYLE + '<style>', 1)
    return h.replace('<body>', '<body><h3 style="margin:0 0 8px;font-size:15px"></h3>', 1)


def main():
    ffmpeg = find_ffmpeg()
    work = Path(tempfile.mkdtemp(prefix='cg-demo-'))
    profile = Path(tempfile.mkdtemp(prefix='cg-demo-profile-'))
    shots = []  # (png path, seconds)
    logo = base64.b64encode((root / 'CipherGap/assets/ciphergap.svg').read_bytes()).decode()
    base = 'https://web.telegram.org/a/'
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(str(profile), channel='chromium', headless=True,
            args=[f'--disable-extensions-except={root}/CipherGap', f'--load-extension={root}/CipherGap'],
            viewport={'width': W, 'height': H})
        ctx.route(base + '**', lambda route, req: route.fulfill(body=page_html(), content_type='text/html'))
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
        worker.evaluate('()=>chrome.storage.local.set({ciphergap_ui_language:"en"})')
        pages = []
        for uid, who in (('601', 'Alice'), ('602', 'Bob')):
            p = ctx.new_page(); p.goto(base + '#' + uid); p.wait_for_selector('#ciphergap-toolbar')
            p.evaluate('w=>{document.querySelector("h3").textContent=w}', who + ' - mock messenger page (local test fixture)')
            pages.append(p)
        tabs = worker.evaluate('b=>chrome.tabs.query({url:b+"*"}).then(t=>t.map(x=>x.id))', base)
        contexts = [worker.evaluate('id=>chrome.tabs.sendMessage(id,{action:"get_chat_context"})', t) for t in tabs]
        order = sorted(range(2), key=lambda i: contexts[i]['storageKey'])
        pages = [pages[i] for i in order]; tabs = [tabs[i] for i in order]; contexts = [contexts[i] for i in order]
        # Tab ids come back in tab order; re-label so Alice is always chat 601.
        for p, who in zip(pages, ('Alice', 'Bob')):
            p.evaluate('w=>{document.querySelector("h3").textContent=w}', who + ' - mock messenger page (local test fixture)')

        def action(i, m):
            return worker.evaluate('([id,m])=>chrome.tabs.sendMessage(id,m)', [tabs[i], dict(m, expectedStorageKey=contexts[i]['storageKey'])])
        renderer = ctx.new_page()

        def frame(caption, seconds, note=None):
            for p in pages:
                p.bring_to_front(); p.wait_for_timeout(350)
            a = base64.b64encode(pages[0].screenshot()).decode(); b = base64.b64encode(pages[1].screenshot()).decode()
            n = f'<div class="note">{html.escape(note)}</div>' if note else ''
            renderer.set_viewport_size({'width': 1280, 'height': 720})
            renderer.set_content(f'''<style>*{{box-sizing:border-box}}body{{margin:0;width:1280px;height:720px;background:#163b32;color:#fff;font-family:system-ui,sans-serif;position:relative}}
header{{display:flex;align-items:center;gap:14px;padding:20px 40px}}header img{{width:44px}}header b{{font-size:26px}}header span{{margin-inline-start:auto;color:#d6ed91;font-size:15px}}
.cap{{padding:0 40px 14px;font-size:27px;font-weight:650;color:#d6ed91;height:50px}}.row{{display:flex;gap:24px;justify-content:center}}.row img{{width:560px;height:{int(560*H/W)}px;border-radius:12px;background:#fff}}
.note{{position:absolute;left:40px;right:40px;bottom:18px;background:#0c2620;border:1px solid #3f6f5f;border-radius:10px;padding:10px 16px;font:14px/1.4 ui-monospace,monospace;color:#cfe6c0;overflow-wrap:anywhere}}</style>
<header><img src="data:image/svg+xml;base64,{logo}"><b>CipherGap</b><span>Demo on a local mock page, not a real messenger</span></header>
<div class="cap">{html.escape(caption)}</div><div class="row"><img src="data:image/png;base64,{a}"><img src="data:image/png;base64,{b}"></div>{n}''')
            path = work / f'f{len(shots):03d}.jpg'; renderer.screenshot(path=str(path), type='jpeg', quality=92); shots.append((path, seconds))

        editor = '#editable-message-text'
        frame('Two people, one ordinary chat, CipherGap installed on both sides', 3)
        started = action(0, {'action': 'start_key_exchange'}); assert started['ok'], started
        frame('1. Alice chooses "Set up secure chat" and sends a key request', 4)
        request = pages[0].evaluate('testSent.at(-1)'); pages[1].evaluate('s=>addMessage(s)', request)
        accept = pages[1].locator('[data-ciphergap-exchange-action=accept]'); accept.wait_for(state='visible')
        frame('2. Bob sees the request in the chat and can accept or decline', 4)
        accept.click(); pages[1].wait_for_function('testSent.some(s=>s.startsWith("start exchange ack:"))')
        ack = pages[1].evaluate('testSent.find(s=>s.startsWith("start exchange ack:"))'); pages[0].evaluate('s=>addMessage(s)', ack)
        pages[0].wait_for_function('testSent.some(s=>s.startsWith("cg-sas|"))')
        frame('3. Both sides derive the same key (ECDH) and show a six-digit code to compare', 5)
        for i in (0, 1):
            assert action(i, {'action': 'mark_key_verified', 'nonce': started['nonce']})['ok']
        frame('4. They compare the code over a trusted channel and mark the key verified', 4)
        pages[0].locator(editor).fill('Meet at 7. Bring the signed documents.')
        frame('5. Alice writes a normal message', 3)
        pages[0].locator('#ciphergap-btn').click(); pages[0].wait_for_function('!document.getElementById("ciphergap-btn").disabled')
        packet = pages[0].evaluate('testSent.at(-1)'); assert packet.startswith('CGP|')
        sid = pages[1].evaluate('s=>addMessage(s)', packet)
        row = pages[1].locator('#message-' + sid); row.locator('.ciphergap-decrypt-button').wait_for()
        frame('6. She presses Encrypt; the messenger only ever receives ciphertext', 5, note='Sent through the messenger: ' + packet[:96] + '...')
        row.locator('.ciphergap-decrypt-button').click(); row.locator('.ciphergap-plaintext').wait_for()
        frame('7. Bob clicks Decrypt and reads it. Keys never leave the device', 6)
        ctx.close()
    # Playwright's minimal ffmpeg only reads piped images: repeat frames at 4 fps.
    webm = out / 'ciphergap-demo.webm'
    feed = subprocess.Popen([ffmpeg, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '4', '-c:v', 'mjpeg', '-i', 'pipe:0', '-vf', 'scale=1280:-2,format=yuv420p',
                    '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-deadline', 'good', '-an', str(webm)], stdin=subprocess.PIPE)
    for path, secs in shots:
        data = Path(path).read_bytes()
        for _ in range(int(secs * 4)):
            feed.stdin.write(data)
    feed.stdin.close()
    assert feed.wait() == 0, 'ffmpeg failed'
    shutil.copy(shots[-1][0], out / 'poster.jpg')
    try:
        from PIL import Image
        frames, durations = [], []
        for path, secs in shots:
            im = Image.open(path).convert('RGB').resize((720, 405), Image.LANCZOS)
            frames.append(im.quantize(colors=96, method=Image.MEDIANCUT)); durations.append(int(secs * 1000))
        frames[0].save(out / 'ciphergap-demo.gif', save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
    except ImportError:
        print('Pillow not installed; GIF skipped')
    print('frames:', len(shots), 'seconds:', sum(s for _, s in shots), 'work dir:', work)


main()
