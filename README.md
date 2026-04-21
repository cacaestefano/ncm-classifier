# NCM Classifier

Static web app for NCM product classification. Runs entirely in the browser.

## Usage

1. Open the hosted URL (once — cached by Service Worker for offline use).
2. Go to **Banco de Dados**, download the two Siscomex files from the linked URLs, and drag them into the app.
3. Go to **Importar** and drop your client's product spreadsheet.
4. Map columns in **Mapear Colunas**.
5. Search and assign NCMs in **Classificar**, then expand attributes and fill values.
6. Export in **Exportar**.

## Development

```
npm install
npm run dev             # http://localhost:5173
npm run test -- --run   # unit + integration
npx playwright test     # e2e
npm run build           # produces build/ folder
```

## Deployment

The app is deployed to GitLab Pages via `.gitlab-ci.yml` on every push to `main`.

SQLite-WASM uses OPFS, which requires `SharedArrayBuffer`, which requires cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`) on the top-level HTML response. GitLab Pages does not support custom response headers, so the app ships with `static/coi-serviceworker.min.js`, a tiny service worker that reflects both headers on subsequent loads. It is referenced from `src/app.html` and auto-registers on first visit.

If you move this app to a host that supports custom headers (Cloudflare Pages, Netlify, Vercel), you can remove the `coi-serviceworker.min.js` reference and configure headers directly instead.
