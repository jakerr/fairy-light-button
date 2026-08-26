# fairy-lights

A one-button web controller for micro:bit GPIO 0.

The GitHub Pages site is in [`web/`](web/). It uses the pinned `microbit-web-bluetooth` browser bundle for micro:bit discovery and the custom UART protocol: `?` reads the state, while `0` and `1` turn the lights off and on.

## Publish on GitHub Pages

The workflow deploys `web/` from `main`; it does not use a `gh-pages` branch. After pushing this repository to GitHub, open **Settings → Pages** and choose **GitHub Actions** as the source. Every push to `main` will then publish the site.

Use a Chromium-based browser with Bluetooth support (such as Chrome or Edge). GitHub Pages supplies the required HTTPS context for Web Bluetooth.
