# CipherGap website

Persian RTL product site and installation/user guide, maintained on the
`website` branch. Plain HTML, CSS and JavaScript; no build step, external fonts,
analytics or runtime dependencies.

From the repository root:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/`. All assets use relative paths, including when
served below `/CipherGap/`. Serve the repository root, not the `website/` folder.
Chrome downloads use the `main` branch; Firefox downloads use `firefox`.
The site does not claim that the extension is available in browser stores.

For GitHub Pages, choose **Settings → Pages → Deploy from a branch**, then
`website` and `/ (root)`. This repository change does not enable hosting itself.
Other static hosts can serve the root in the same way.

Browser verification:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 website/verify.py
```

If a system Chrome installation is available, the verifier uses it. Set
`CHROMIUM_BINARY` to choose another executable. The check starts a local server
and verifies responsive layout, assets, browser tabs, keyboard controls, mobile
navigation, clipboard feedback, FAQs and a GitHub Pages-style subpath.
