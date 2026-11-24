# Luma Chat

Luma Chat is a local-first, installable BYOK AI chat application. It supports direct browser connections to Gemini, OpenAI, and LM Studio. The design references in `DESIGN/` describe the intended visual direction; this is an independent implementation.

## Run locally

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

Open the address printed by Vite. To build the installable production version, run `npm run build` followed by `npm run preview`. PWA caching is enabled in the production build. A deployed PWA requires HTTPS; localhost is suitable for local development.

## Configure a provider

Open Settings, choose a provider, enter a model ID, and supply your own key where required. Test connection requests the model list; you can enter a model manually if model listing is unavailable. The app connects directly from the browser; it has no proxy or backend. A provider can reject browser requests because of CORS or other restrictions.

For LM Studio, start its server and enable CORS. The default base URL is `http://localhost:1234/v1`. Authentication is optional when disabled in LM Studio; use a token when it is enabled. On a phone, `localhost` means the phone: use the computer's accessible LAN address and configure LM Studio to serve on the local network. Browser local-network permission, HTTPS mixed-content rules, CORS, and firewall settings vary. Enable authentication when exposing the server; plain HTTP can expose prompts and tokens to the network. A trusted HTTPS connection is preferable. Browser and device support must be verified for the actual environment.

The app keeps session keys in memory until lock, reload, or close. Opt-in encrypted storage uses a password-derived AES-GCM key. Losing the password prevents recovery. Encryption protects stored ciphertext from some device-storage exposure; it does not protect a key while the app is unlocked from malicious page scripts or a compromised device. API keys are excluded from backups and are never intentionally logged. Cloud providers receive submitted messages and attachments. Direct browser key use is a deliberate user-selected tradeoff and does not meet OpenAI's recommendation to keep API keys on a server.

## Data and offline behavior

Conversations, drafts, attachments, settings, and any encrypted saved keys are stored in IndexedDB on the current browser/device. Data is not automatically synchronized. Browser storage may be cleared or evicted; export backups regularly. Backups include conversations, attachments, and provider settings but never keys. Imports require a preview and explicit conflict handling.

After the production app has been loaded and cached, the shell and saved chats can be opened offline. Cloud inference requires network access; LM Studio inference requires the local service to be reachable. Images and plain text files up to 5 MB each can be attached. Image support must be explicitly enabled for a model that accepts images. Do not attach content you do not want sent to the selected provider.

## Checks

```sh
npm test
npm run build
npm run preview -- --port 55167 --strictPort
node tests/browser-smoke.mjs
```

The browser smoke test uses installed Chrome at its standard Windows path and a mocked LM Studio endpoint; it does not call a real model or cloud API. Actual phone-to-LM-Studio connectivity and provider behavior depend on the user's environment and require separate device testing.

## GitHub Pages deployment

GitHub Pages is deployed by `.github/workflows/deploy.yml` on pushes to `main` or manual workflow dispatch. The workflow runs `npm ci`, unit tests, and the production build before publishing `dist` to the `github-pages` environment. In repository Settings → Pages, set the source to GitHub Actions. The application uses relative asset paths so it works under the repository's Pages subpath. Deployment requires no API keys or repository secrets; users configure their own credentials in the app.
