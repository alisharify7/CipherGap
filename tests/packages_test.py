"""Browser packages must share every byte except their platform manifest."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("builder", Path(__file__).resolve().parents[1] / "tools/build_extension.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BrowserPackages(unittest.TestCase):
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
