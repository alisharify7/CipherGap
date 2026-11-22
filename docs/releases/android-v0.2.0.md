# CipherGap Android 0.2.0

Brings the 1.8.0 desktop features to Android and adopts the new teal design.
This build is **not yet published as a signed release**: the production signing
key is kept outside the repository, so the signed APK must be built by the
maintainer (`./android/gradlew -p android assembleRelease`, see `android/README.md`).
Continuous integration produces an unsigned/debug build for testing.

## What's included

- Message format v2 with forward secrecy (daily key ratchet and retention
  window), HKDF/PBKDF2 key derivation and authenticated headers. **Both people
  must update**: Android 0.1.4 and desktop 1.7.0 cannot read v2 messages.
- Self-destructing messages (timer or burn after reading).
- Secure group chats: invitation, join and approve from the in-chat cards and
  the popup's Group section.
- New teal theme, bottom tab bar and status hero in the in-app security screen
  and the in-chat controls (same shared core as the browser extension).
- The new storage settings (forward secrecy, retention, burned-message markers)
  are allowed for messenger pages; keys remain in the Keystore-encrypted store.

## Not included

- The passphrase app lock is a browser-extension feature. On Android all keys
  are already stored in an Android Keystore-encrypted private store, and the
  lock control is hidden. A native biometric/device-credential lock is not part
  of this build.
- Not run on a physical device in this change set; validate on your device and
  WebView before distributing.
