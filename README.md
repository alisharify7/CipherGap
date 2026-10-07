# CipherGap website

This branch publishes the bilingual static website at
[alisharify7.github.io/CipherGap](https://alisharify7.github.io/CipherGap/).
Product source lives on [main](https://github.com/alisharify7/CipherGap/tree/main),
[firefox](https://github.com/alisharify7/CipherGap/tree/firefox), and
[android](https://github.com/alisharify7/CipherGap/tree/android).

The page explains local message/file encryption, the need for both participants
and a shared key, installation, backups and QR transfer, and privacy limits.
Persian is the default; English text and screenshots switch together. Both use
bundled fonts. Native HTML provides the FAQ and screenshot dialog; the site has
no framework, analytics, or chat backend.

## Preview and verify

```sh
python3 -m http.server 8769 --bind 127.0.0.1
# In another terminal:
python3 tests/browser_website.py
```

The browser check requires installed Playwright/Chromium. It covers both
languages, 320/390/1440 px layouts, platform tabs and keyboard navigation,
screenshot loading/language/dialog behavior, FAQ, clipboard, persistent choices,
mobile navigation, internal links, and downloadable package hashes/manifests.
Visual captures are saved under ignored `dist/website-validation/`.

## Current images and downloads

`website/screenshots/` contains actual desktop extension **1.7.0** and Android
**0.1.3** captures in Persian and English. A sanitized test conversation and a
synthetic key demonstrate the interface; these are not live-account screenshots.
`provenance.json` records source commits, APK and image SHA-256 digests, and the
capture environment. Desktop images come from the loaded Chromium extension;
Android images come from the native emulator compositor running the actual APK.

To refresh the screenshots, use adjacent current source worktrees and a disposable
Android emulator named **CipherGapTransfer** on port 5554. The script installs
and clears application data only on that dedicated emulator. A compatible WebView
is required (the recorded run used Cromite 147, Android 16/API 36).

```sh
ANDROID_HOME=/path/to/sdk python3 tools/capture_website_screenshots.py \
  --desktop ../CipherGap --android ../CipherGap-android
```

`website/downloads/` serves the matching Chrome/Firefox ZIPs and Android debug
APK directly. These are manual installation builds, not store publications or
new GitHub Releases. Android requires Android 8+ and a compatible isolated-world
WebView. Firefox 140+ uses a temporary add-on that is removed on restart.
`checksums.txt` and `provenance.json` identify the published bytes and commits.
When updating versions, rebuild from the corresponding source branches, replace
packages and checksums, recapture images, and update website copy/translations
and version checks in the browser validation.

## Publishing

Push this branch to trigger `.github/workflows/pages.yml`. It copies only the
page, website assets/downloads, and current brand SVG into the Pages artifact.
After the workflow succeeds, verify the public headline and downloadable assets.
