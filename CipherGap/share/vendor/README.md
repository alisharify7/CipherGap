# Offline QR support

Only the trusted popup loads these files. Keys/images never go to a QR service.

- qrcode-generator 2.0.4 (`dist/qrcode.js`), MIT: https://github.com/kazuhikoarase/qrcode-generator
- jsQR 1.4.0 (`dist/jsQR.js`), Apache-2.0: https://github.com/cozmo/jsQR

Vendored from the pinned npm tarballs after checking their SHA-512 integrity.
Original license files are included. QR contains ASCII Base64 of the exact UTF-8
key, so Persian/emoji keys survive scanner and device differences.
