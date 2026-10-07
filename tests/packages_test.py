"""Browser packages must share every byte except their platform manifest."""
import importlib.util
import hashlib
import json
import subprocess
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("builder", Path(__file__).resolve().parents[1] / "tools/build_extension.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BrowserPackages(unittest.TestCase):
    def test_android_packages_current_extension_core(self):
        root = Path(__file__).resolve().parents[1]
        spec = importlib.util.spec_from_file_location("android_builder", root / "tools/build_android_assets.py")
        android = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(android)
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            android.build(output)
            sources = json.loads((output / "core-sources.json").read_text())
            for name, digest in sources.items():
                original = (root / name).read_bytes()
                self.assertEqual(hashlib.sha256(original).hexdigest(), digest, name)
                if name != "CipherGap/popup/popup.html":
                    self.assertEqual(original, (output / "extension" / name.removeprefix("CipherGap/")).read_bytes(), name)
            manifest = json.loads((root / "CipherGap/manifest.json").read_text())
            for group in manifest["content_scripts"]:
                bundle = (output / ("page.js" if group.get("world") == "MAIN" else "content.js")).read_text()
                for name in group.get("js", []):
                    self.assertIn((root / "CipherGap" / name).read_text(), bundle, name)
            styles = [name for group in manifest["content_scripts"] for name in group.get("css", [])]
            self.assertEqual((output / "content.css").read_text(), "\n".join((root / "CipherGap" / name).read_text() for name in styles))
            self.assertIn("popup_host.js", (output / "extension/popup/popup.html").read_text())
            # Both execution worlds must honor the same hosts/paths as desktop.
            for bundle_name in ("page.js", "content.js"):
                guard = (output / bundle_name).read_text().splitlines()[0][4:-3]
                urls = {match[:-1] + "?chat=601": True for match in manifest["host_permissions"]}
                urls.update({"https://web.telegram.org/k/": False, "https://web.rubika.ir.evil.test/": False,
                             "http://web.splus.ir/": False, "https://web.splus.ir:444/": False})
                script = "const vm=require('node:vm');const guard=" + json.dumps(guard) + ";"
                script += "for(const [url,expected] of Object.entries(" + json.dumps(urls) + ")){"
                script += "const window={};window.top=window;const context={window,location:new URL(url)};"
                script += "if(vm.runInNewContext(guard,context)!==expected)throw Error(url);"
                script += "window.top={};if(vm.runInNewContext(guard,context))throw Error('iframe');}"
                subprocess.run(["node", "-e", script], check=True)

    def test_common_source_and_platform_manifests(self):
        with tempfile.TemporaryDirectory() as folder:
            a = builder.build("chrome", Path(folder) / "chrome.zip")
            b = builder.build("firefox", Path(folder) / "firefox.zip")
            with zipfile.ZipFile(a) as chrome, zipfile.ZipFile(b) as firefox:
                self.assertEqual(chrome.namelist(), firefox.namelist())
                for file in chrome.namelist():
                    if file != "manifest.json":
                        self.assertEqual(chrome.read(file), firefox.read(file), file)
                cm = json.loads(chrome.read("manifest.json"))
                fm = json.loads(firefox.read("manifest.json"))
                self.assertEqual(cm["background"], {"service_worker": "background.js"})
                self.assertEqual(fm["background"], {"scripts": ["background.js"]})
                self.assertNotIn("browser_specific_settings", cm)
                self.assertEqual(fm["browser_specific_settings"]["gecko"]["strict_min_version"], "140.0")
                self.assertIn("clipboardWrite", fm["permissions"])
                self.assertNotIn("clipboardRead", fm["permissions"])
            first = a.read_bytes()
            builder.build("chrome", a)
            self.assertEqual(first, a.read_bytes())
