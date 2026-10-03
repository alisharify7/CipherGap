# Firefox edition and shared builds

`main` is the source of truth for both browsers. The `firefox` branch uses exactly
the same UI, encryption, translations, adapters and tests. Only its generated
manifest differs: Firefox uses a background event page, adds clipboardWrite for
Copy key, and declares no data collection and its Firefox minimum version.

Build either package from either branch:

```sh
python3 tools/build_extension.py --target chrome
python3 tools/build_extension.py --target firefox
```

Packages in `dist/` have `manifest.json` at their root. Firefox desktop 140+ is
required by the manifest. Firefox Android 142+ is declared for compatibility,
but Android behavior has not been validated.

For temporary desktop installation, download the `firefox` branch, open
`about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and
select `CipherGap/manifest.json`. Alternatively select the generated Firefox
ZIP. Allow Bale site access and refresh Bale. Temporary installations disappear
on browser restart. Permanent installation requires Mozilla signing; this
repository does not contain a signed AMO release.

https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/

## Automatic synchronization

The custom synchronization workflow is prepared locally; its initial push is
blocked by the configured GitHub token missing workflow scope. Until that
permission is available, builds share all code and branch updates are performed
manually. Once deployed, `.github/workflows/sync-firefox.yml` validates shared Node tests and package
identity, builds both targets, lints Firefox, copies the shared product source into firefox, regenerates
the Firefox manifest and pushes without rewriting branch history. Workflow files
are owned by main and are excluded from the product copy. Changes should
be made on main. Edit the generator for platform manifest differences. The
workflow uses the repository GITHUB_TOKEN with contents:write. Uploading the
workflow initially requires GitHub credentials with workflow permission.

## Checks

```sh
node --test tests/*.test.js
python3 -m unittest discover -s tests -p '*_test.py'
python3 tests/browser_chrome.py
python3 tests/browser_firefox.py
```

Browser checks need optional Python Playwright/Marionette tools. Install them in
an isolated environment with `pip install playwright marionette_driver`, and
install Chromium with `playwright install chromium`. The Firefox check defaults
to Debian's real ESR binary; set FIREFOX_BINARY on other systems. Both checks
use new, isolated profiles and synthetic Bale DOM fixtures. They do not log into
user accounts or send messages over the network.

Actual Firefox ESR 140.16 validation covered unsigned installation, background
startup, MAIN/isolated content scripts, ECDH/SAS between two fixtures, shared keys,
verified trust, Persian/English encrypted messages, automatic decryption, native
Blob download capture, exact decrypted file bytes and the bound popup settings.
TypedArray species and ArrayBuffer realm checks are compatible with Firefox's
Xray wrappers. CGP/CGPE formats are unchanged.
