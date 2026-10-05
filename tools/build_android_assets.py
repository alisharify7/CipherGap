#!/usr/bin/env python3
"""Package the current extension directly; preserve manifest script order/worlds."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]

def build(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / 'CipherGap', output / 'extension', dirs_exist_ok=True)
    mobile = ROOT / 'android/app/src/main/assets'
    shutil.copytree(mobile, output, dirs_exist_ok=True)
    manifest = json.loads((ROOT / 'CipherGap/manifest.json').read_text())
    isolated, main, css = [], [], []
    for group in manifest['content_scripts']:
        (main if group.get('world') == 'MAIN' else isolated).extend(group.get('js', []))
        css.extend(group.get('css', []))
    def joined(names):
        return '\n;\n'.join((ROOT / 'CipherGap' / name).read_text() for name in names)
    (output / 'page.js').write_text(joined(main))
    shim = (mobile / 'host.js').read_text()
    bootstrap = (mobile / 'content_host.js').read_text()
    bundle = 'if (window === window.top && (location.hostname !== "web.telegram.org" || location.pathname.startsWith("/a/"))) {\n'
    bundle += 'globalThis.CIPHERGAP_MANIFEST=' + json.dumps(manifest) + ';\n'
    bundle += 'const CIPHERGAP_STYLES=' + json.dumps(joined(css)) + ';\n'
    bundle += 'const CIPHERGAP_MOBILE_STYLES=' + json.dumps((mobile / 'content_mobile.css').read_text()) + ';\n' + shim
    bundle += '\n' + joined(isolated) + '\n' + bootstrap + '\n}'
    (output / 'content.js').write_text(bundle)
    (output / 'content.css').write_text(joined(css))
    popup = (ROOT / 'CipherGap/popup/popup.html').read_text().replace(
        '<script src="../share/namespace.js">',
        '<script src="/assets/popup_host.js"></script><link href="/assets/mobile.css" rel="stylesheet"/><script src="../share/namespace.js">')
    (output / 'extension/popup/popup.html').write_text(popup)
    (output / 'popup_host.js').write_text('globalThis.CIPHERGAP_MANIFEST=' + json.dumps(manifest) + ';\n' + shim)
    sources = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
               for p in (ROOT / 'CipherGap').rglob('*') if p.is_file()}
    (output / 'core-sources.json').write_text(json.dumps(sources, indent=2) + '\n')

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    build(p.parse_args().output)
