# FitGenie – Gemini-Powered Virtual Try-On

FitGenie is a Chrome extension built with Angular 17 that lets shoppers preview how clothing items will look on them. Upload your photo once, click garments on compatible store pages, and get an AI-generated try-on powered by Google Gemini.

## Project Structure

```
fitgenie/
├── manifest.json
├── angular.json
├── package.json
├── tsconfig*.json
└── src/
    ├── popup.html                    # Angular popup entry point
    ├── main.ts                       # Bootstraps the standalone Angular app
    ├── styles.css                    # Global popup styling
    ├── app/
    │   ├── app.component.ts          # Root component wrapping the popup
    │   ├── components/               # Standalone UI building blocks
    │   ├── services/                 # Chrome storage, messaging, and Gemini API clients
    │   └── models/                   # Shared TypeScript interfaces
    ├── background/service-worker.ts  # Extension service worker (MV3)
    └── content-scripts/product-selector.ts  # Injected product capture script
```

## Prerequisites

- Node.js `>= 18.13`
- npm `>= 9`
- A Google Gemini API key with access to `gemini-pro-vision`

## Setup

```bash
npm install
```

During development you can use the Angular dev server:

```bash
npm start
```

> **Note:** The popup UI is built as a standalone Angular application. `npm start` launches it on <http://localhost:4200> for rapid iteration, but Chrome extension APIs are not available in that environment.

## Build the Chrome Extension

Compile all extension bundles (popup, background, content script):

```bash
npm run build:extension
```

The packaged extension is emitted to `dist/extension`. It contains:

- `popup.html` and associated Angular assets
- `background/service-worker.js`
- `content-scripts/product-selector.js`
- `manifest.json`

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `<project-root>/dist/extension`

## Configure the Gemini API Key

FitGenie expects the Gemini API key in Chrome storage under `fitgenie:geminiApiKey`. You can seed it manually from the extension DevTools console:

```js
chrome.storage.local.set({ 'fitgenie:geminiApiKey': 'YOUR_API_KEY_HERE' });
```

Alternatively, add a custom settings page or options page later to manage this value securely.

## Development Notes

- **Popup UI** uses Angular 17 standalone components (`fg-` prefix) and relies on signals for state management.
- **Messaging** is handled through `ChromeStorageService` and `MessageService`, wrapping the Chrome APIs with typed interfaces (`src/app/models/messaging.models.ts`).
- **Background worker** (`src/background/service-worker.ts`) receives try-on requests, calls the Gemini API, and broadcasts synthesized results back to the popup.
- **Content script** listens for modifier-clicks on product imagery (`Alt/Ctrl/⌘ + click`) to collect product metadata and send it to the popup.
- **Assets**: Placeholder transparent PNG icons are included; replace the files in `src/assets/icons/` with branded artwork before publishing.

## Linting

Angular ESLint is configured. Run:

```bash
npm run lint
```

## Next Steps

- Add an options page for configuring the Gemini API key within the extension UI.
- Harden product detection (e.g., by injecting a dedicated overlay UI).
- Persist try-on history and allow comparisons between different outfits.
- Extend content security policies if the popup needs third-party resources.

