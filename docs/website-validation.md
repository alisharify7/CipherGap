# Website redesign validation — 2026-10-07

Validated the static site with `python3 tests/browser_website.py` against the
local HTTP preview using installed Playwright/Chromium. Passed Persian/English
at 320, 390 and 1440 px; no horizontal overflow across the four installation
panels. Checked RTL/LTR keyboard tabs, persistent language/platform selection,
clipboard, bundled fonts, mobile menu, all 12 FAQ entries, screenshot language
switching/loading and dialog close/focus, internal links, and all three binary
downloads against published SHA-256 digests. Chrome/Firefox ZIP manifests match
1.7.0, with their respective service worker/event page. The APK matches the
binary used for the Android captures.

Visually reviewed full desktop layouts, phone hero and installation layouts,
and native app captures. Real desktop extension 1.7.0 and Android 0.1.3 images
use a synthetic demonstration conversation. Source commits and image hashes
are in `website/screenshots/provenance.json`; downloadable build hashes and
commits are in `website/downloads/provenance.json` and `checksums.txt`.
Verified ZIP source files match main; APK contains the latest Eitaa URL fix.
`aapt dump badging` reports Android version 0.1.3/versionCode 4, minSdk 26 and
a debuggable build. No new store submission or GitHub Release was performed.

Executed the Pages workflow assembly commands locally and verified every linked
static asset exists in the generated artifact. JavaScript syntax checks, Python
compilation and `git diff --check` passed. Live-account messenger behavior was
not part of this website change; product validation remains on the source
branches. Preview screenshots and assembled site are not committed.
