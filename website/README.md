# CipherGap website

A static Persian/English product site with Chrome and Firefox installation steps, key verification, message/file tutorials, pause controls and troubleshooting. Only Bale is active; the other messenger integrations are labeled In development. Official service marks are bundled locally, with their sources in `messengers/README.md`.

English is the default for new visitors. Select فارسی / English in the header. Language is saved locally, direction changes between RTL/LTR, and fonts are bundled: Vazirmatn for Persian, Inter for English. Neither language needs a font CDN; OFL licenses are in `website/fonts/`.

## GitHub Pages

The site is currently hosted directly from `website` / root using GitHub Pages. The custom `.github/workflows/pages.yml` is prepared locally; the initial push is blocked because the configured GitHub token lacks workflow scope. After deploying that workflow, switch Pages source to **GitHub Actions**. It publishes on website pushes or Run workflow, assembling only public static assets before upload and deployment with the official Pages actions.

Expected URL: https://alisharify7.github.io/CipherGap/

https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Local preview and checks

From the repository root: `python3 -m http.server 8787`

Run `python3 website/verify.py` with Python Playwright installed and Chrome available. It checks both languages, persisted preference, local fonts, responsive widths 320–1440px, Pages subpath assets, mobile navigation, keyboard tabs, FAQ, clipboard success and denied permissions. Screenshots are saved in this directory.

Version 1.3.0 uses shared Indigo/Slate tokens from `CipherGap/share/theme.css`,
browser-first install tabs with saved preference, and guides for inline exchange
consent, absolute 15-minute expiry and media preview/download. English remains
the default; Persian and browser choice persist locally. The Pages workflow
must package `website/messengers`, `website/fonts`, shared theme CSS and product
screenshots as well as the page. The workflow is prepared locally; pushing it
still requires credentials with workflow permission. Branch-based Pages hosting
continues to publish the website in the meantime.
