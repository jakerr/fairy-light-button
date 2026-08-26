# fairy-lights

A one-button web controller for micro:bit GPIO 0.

The GitHub Pages site is in [`web/`](web/). It uses the pinned `microbit-web-bluetooth` browser bundle and toggles GPIO 0 between off (`0`) and on (`1`) after connecting to a micro:bit that exposes the Bluetooth IO Pin service.

## Publish on GitHub Pages

The workflow deploys `web/` from `main`; it does not use a `gh-pages` branch. After pushing this repository to GitHub, open **Settings → Pages** and choose **GitHub Actions** as the source. Every push to `main` will then publish the site.

Use a Chromium-based browser with Bluetooth support (such as Chrome or Edge). GitHub Pages supplies the required HTTPS context for Web Bluetooth.
