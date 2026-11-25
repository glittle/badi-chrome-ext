# Badíʿ Calendar Chrome Extension #

[![Install now.](https://developer.chrome.com/webstore/images/ChromeWebStore_BadgeWBorder_v2_206x58.png)
](https://chrome.google.com/webstore/detail/bad%C3%AD-calendar/egekinjjpolponbbfjimifpgfdmphomp)


### Development ###

The extension is built with [WXT](https://wxt.dev). One source tree produces Chrome, Edge, and Firefox packages. The popup and service worker stay plain JavaScript (no UI framework). Load the built folder, not the repository root.

```bash
npm install
npm run dev            # Chrome, with reload while you work
npm run dev:edge
npm run dev:firefox
npm run build          # .output/chrome-mv3, edge-mv3, and firefox-mv3
npm run build:chrome
npm run build:edge
npm run build:firefox
npm run zip            # store zips for Chrome and Edge in .output/
npm run zip:firefox    # builds, not published
```

Stylesheets are compiled from the Less files in `styles/` during dev, build, and zip. Do not commit the generated CSS. `extras/` (store listing text, old art sources) is not copied into the package. `MakeZip.cmd` is gone; `npm run zip` replaces it.

`npm run dev` is for working on the extension. Its manifest adds WXT's reload helpers and is not the store package. Use `npm run build` or `npm run zip` for that. Recent Chrome releases ignore `--load-extension`. If the dev window opens without the extension, load `.output/chrome-mv3-dev` from the extensions page, or point web-ext at Chromium.

Firefox output uses the same MV3 service worker. Publishing to Firefox is deferred. The Firefox manifest adds an unsigned extension id (`badi-calendar@glittle.org`) so the build can be installed for testing. Chrome and Edge keep the store signing key, so existing installs keep their extension id, permissions, `_locales`, and storage keys.

### To be done ###

* Do you have ideas or suggestions? Please let me know.
* Feel free to make a Pull Request with improvements!

### Current Features ###

* See http://bit.ly/BadiChrome

### Who do I talk to? ###

* Glen Little
