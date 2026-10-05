# Website installation and everyday-use guide — 2026-10-05

Choose Android, Chrome, Firefox, or Edge/Brave to see the relevant installation
steps. Android devices initially select the standalone APK; Firefox users see the
temporary desktop installation. Choices and English/Persian language persist.
Keyboard arrow/Home/End navigation and copyable browser addresses are supported.

The Android guide links to the 0.1.1 preview APK, release checksums and build
instructions. It explains installation permission, compatible WebView, direct
messenger sign-in, chat security, appearance and foreground-only notifications.
The shared quick start covers timed key exchange, trusted six-digit verification,
text/emoji, files, media previews, downloads, pause and deleting local keys/data.
Desktop messenger links, common troubleshooting, unsupported iOS/Safari/native
apps and the displayed-plaintext privacy boundary are included.

Validation: `python3 tests/browser_website.py http://127.0.0.1:8769/` passes both
languages at 320, 390 and 1440 px, all four panels, keyboard navigation, saved
preferences, clipboard, local fonts, mobile menu and Android/Firefox defaults.
Desktop English and mobile Persian installation layouts were visually reviewed.
GitHub Pages publishes this branch's root; no new build dependency is needed.
