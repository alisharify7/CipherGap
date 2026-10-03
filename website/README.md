# CipherGap website

A static Persian/English product site with Chrome and Firefox installation steps, key verification, message/file tutorials, pause controls and troubleshooting. Only Bale is active; other messenger support is explicitly a roadmap.

Select فارسی / English in the header. Language is saved locally, direction changes between RTL/LTR, and fonts are bundled: Vazirmatn for Persian, Inter for English. Neither language needs a font CDN; OFL licenses are in `website/fonts/`.

## GitHub Pages

`.github/workflows/pages.yml` publishes on pushes to `website`, or through Run workflow. The repository Pages source must be **GitHub Actions**. The workflow assembles only public static assets, then uploads and deploys them with the official Pages actions.

Expected URL: https://alisharify7.github.io/CipherGap/

https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Local preview and checks

From the repository root: `python3 -m http.server 8787`

Run `python3 website/verify.py` with Python Playwright installed and Chrome available. It checks both languages, persisted preference, local fonts, responsive widths 320–1440px, Pages subpath assets, mobile navigation, keyboard tabs, FAQ, clipboard success and denied permissions. Screenshots are saved in this directory.
