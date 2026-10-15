# AutoUpdateExtension (Profile Refresher)

A Chrome extension that keeps a Naukri profile marked as recently updated. See [PLAN.md](PLAN.md) for the full design.

## Requirements
- Google Chrome 120+ (or Edge)
- Node.js 20+ (only for running tests; the extension itself has no build step)

## Load the extension in Chrome
1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (`D:\AutoUpdateExtension`).
4. Pin **Profile Refresher** from the puzzle-piece menu and click it. The popup should say the extension is running.

After changing code, click the **↻ reload** icon on the extension's card in `chrome://extensions`.

To debug the background service worker: on the extension's card, click **service worker** (Inspect views).

## Run tests
```
npm test
```

## Layout
| Path | Purpose |
|---|---|
| `manifest.json` | Extension manifest (MV3) |
| `src/background.js` | Service worker: scheduler, runner, alerts |
| `src/selectors.js` | All Naukri URLs and selectors |
| `src/popup.*`, `src/options.html` | Popup and settings page |
| `icons/` | Toolbar and store icons |
| `tests/` | `node:test` tests |
