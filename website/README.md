# CipherGap website

Static Persian/English installation site, hosted from the `website` branch root
at https://alisharify7.github.io/CipherGap/ through GitHub Pages.
Persian is the default; language, browser choice and direction are saved locally.
Fonts and screenshots are bundled. The page follows the system light/dark
setting (with a manual toggle saved locally), is styled by a single `style.css`
(calm light/dark tokens shared with the extension popup), embeds a self-hosted demo video (`media/`, recorded
against local mock pages by `docs/demo/record_demo.py` on `main`) and has a
clearly marked "coming soon" section for planned, unreleased features.
No third-party scripts or trackers are used.

## Downloads

Desktop 1.7.0 provides Chrome/Chromium/Edge/Brave and Firefox packages.
Android 0.1.4 provides a production-signed release APK with debugging disabled.
The website mirrors the exact GitHub release assets and links to both releases.
`downloads/provenance.json` records source commits, release URLs, the production
signing certificate and file hashes; `downloads/checksums.txt` covers all files.
The older debug APK is retained only to let users of old debug builds update,
export an encrypted backup, then migrate to the production signing identity.
No private signing key or password belongs in website assets.

Desktop supports Bale, Eitaa, Telegram Web A, Rubika and Soroush Plus.
Android supports the same five messengers and needs Android 8+ plus a
compatible isolated-world WebView. The page explains installation, key exchange,
backup/QR transfer, debug-to-release migration and current limitations.
Screenshot provenance describes the builds actually used for those captures;
the capture APK hash can differ from a later release with the same UI.

## Checks

Run the bundled smoke test (it starts its own local server; needs Playwright):

```sh
python3 website/verify.py
```

The fuller suite on `main` can still be pointed at a served copy:

```sh
python3 tests/browser_website.py http://127.0.0.1:8769/
```

The check covers EN/FA, 320/390/1440 px, all install tabs, keyboard navigation,
clipboard, persistence, fonts, device detection, screenshot dialogs, FAQ, local
links and downloaded file hashes. It also accepts the live Pages URL.
