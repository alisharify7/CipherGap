#!/usr/bin/env python3
"""Build both browsers from one source tree; Firefox differs only in manifest."""
import argparse
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "CipherGap"


def manifest_for(target):
    manifest = json.loads((SOURCE / "manifest.json").read_text())
    # Always normalize, so this also builds Chrome from the Firefox branch.
    manifest.pop("browser_specific_settings", None)
    manifest["permissions"] = [p for p in manifest["permissions"] if p != "clipboardWrite"]
    manifest["background"] = {"service_worker": "background.js"}
    if target == "firefox":
        manifest["background"] = {"scripts": ["background.js"]}
        manifest["permissions"].append("clipboardWrite")
        manifest["browser_specific_settings"] = {
            "gecko": {
                "id": "{7b3c6e34-9953-4dbb-b9b9-b5d55a5b333e}",
                "strict_min_version": "140.0",
                "data_collection_permissions": {"required": ["none"]},
            },
            "gecko_android": {"strict_min_version": "142.0"},
        }
    return manifest


def build(target, output=None):
    manifest = manifest_for(target)
    output = output or ROOT / "dist" / f'ciphergap-{manifest["version"]}-{target}.zip'
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(SOURCE.rglob("*")):
            if not file.is_file():
                continue
            relative = file.relative_to(SOURCE).as_posix()
            data = (json.dumps(manifest, indent=2) + "\n").encode() if relative == "manifest.json" else file.read_bytes()
            info = zipfile.ZipInfo(relative, (2026, 10, 3, 0, 0, 0))
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=["chrome", "firefox"], required=True)
    parser.add_argument("--in-place", action="store_true", help="Normalize branch manifest before building")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.in_place:
        (SOURCE / "manifest.json").write_text(json.dumps(manifest_for(args.target), indent=2) + "\n")
    print(build(args.target, args.output))
