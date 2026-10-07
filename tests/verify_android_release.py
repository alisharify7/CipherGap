"""Run with ANDROID_HOME and JAVA_HOME set after assembleRelease."""
import hashlib
import json
import os
from pathlib import Path
import ssl
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
apk = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'android/app/build/outputs/apk/release/app-release.apk'
tools = Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
env = os.environ.copy()
if env.get('JAVA_HOME'):
    env['PATH'] = str(Path(env['JAVA_HOME']) / 'bin') + os.pathsep + env['PATH']

signature = subprocess.check_output([str(tools / 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk)], env=env, text=True)
certificate = ssl.PEM_cert_to_DER_cert((root / 'android/ciphergap-release-cert.pem').read_text())
assert 'Signer #1 certificate SHA-256 digest: ' + hashlib.sha256(certificate).hexdigest() in signature
assert 'CN=Android Debug' not in signature
manifest = subprocess.check_output([str(tools / 'aapt'), 'dump', 'xmltree', str(apk), 'AndroidManifest.xml'], text=True)
debug = [line for line in manifest.splitlines() if 'android:debuggable' in line]
assert not debug or all(line.strip().endswith('0x0') for line in debug), debug
badging = subprocess.check_output([str(tools / 'aapt'), 'dump', 'badging', str(apk)], text=True)
assert "name='com.ciphergap.mobile'" in badging
assert "versionName='0.1.3'" in badging and "versionCode='5'" in badging
assert "targetSdkVersion:'36'" in badging
with zipfile.ZipFile(apk) as archive:
    sources = json.loads(archive.read('assets/core-sources.json'))
    for name, digest in sources.items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
    assert b"appState.debug?' \xc2\xb7 Debug':' \xc2\xb7 Release'" in archive.read('assets/shell.js')
print('PASS release APK: production certificate, debugging disabled, API 36, version 0.1.3/code 5, current shared core')
