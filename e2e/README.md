# Browser regression checks

Use Node.js 22 or newer. Install both dependency sets with `npm ci` and `npm --prefix server ci`. Playwright uses `/usr/bin/chromium` when available; otherwise install its browser with `npx playwright install --with-deps chromium`, or set `E2E_CHROMIUM` to a Chromium executable.

Run `npm run test:e2e`. The runner starts an isolated API with a temporary SQLite directory and a local test-only community upload code, then starts the frontend. Ports 3001 and 8788 must be free. To use other ports, set `E2E_BASE_URL=http://localhost:3002` and `E2E_API_URL=http://localhost:8789`; both must use localhost. The runner stops its own services and deletes its temporary API data after the tests.

The frontend uses the repository-supported `.next-build` output directory. Do not run a production build or another frontend using that directory concurrently. Standard development on `.next` can continue independently.

Checks exercise real browser uploads, layouts and hidden slots, draft recovery, PNG/GIF downloads, template generation, community selection and persistence, server-rendered artwork, short links and viewer pages, QR interactions, deletion, API-failure fallback, small-screen controls and keyboard focus, invalid frames, storage quota errors, delayed upload/share races, and camera sessions. Camera tests use Chromium's simulated video device; they do not validate physical camera permissions, hardware, audio output, or other browser engines.

Results, failure screenshots, and service logs are written under the ignored `.hoplite/artifacts/e2e/` directory. The runner exits unsuccessfully if any check fails. Use `E2E_FILTER='camera|mobile' npm run test:e2e` to select cases when diagnosing a specific failure.

## Deployed smoke checks

After deployment, explicitly provide the HTTPS frontend and API URLs:

```powershell
$env:E2E_DEPLOYED_BASE_URL = 'https://selfie.tiyoouw.app'
$env:E2E_DEPLOYED_API_URL = 'https://api.tiyoouw.app'
npm run test:deployed
```

This uses synthetic photos to check API health/CORS, invalid payload rejection,
upload/edit/draft restore, PNG/GIF export, short links, server-rendered viewer/OG,
QR UI, mobile dialog bounds, delete-token protection, deletion, and hash fallback.
It creates a small number of temporary designs on the selected API and deletes
only designs created by that run. Existing designs and community frames are not
modified. Reports and screenshots go to `.hoplite/artifacts/deployed/`.
Physical camera and OS/browser sharing still require real devices.
