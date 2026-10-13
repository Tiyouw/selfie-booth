# Verify photobooth.himasif.id

## Before deployment

Run `npm test`, `npm run typecheck`, `npm --prefix server test`, `npm --prefix server run typecheck`, `npm run test:e2e`, and `npm run build`. The E2E runner starts its own API and frontend; follow README.md in this directory for browser installation and free ports.

Review the pushed branch and its GitHub checks. Creating or pushing a branch does not establish a production deployment. If Vercel's Git integration uses `main` as its production branch, merging there triggers the frontend deployment; confirm the actual project settings and successful deployment in Vercel. A preview deployment for a branch also depends on the project's settings.

## Configure both services

- Attach `photobooth.himasif.id` to the intended Vercel project and check the deployment's source commit.
- Set `NEXT_PUBLIC_SHARE_API` to the real HTTPS API URL in the production Vercel environment. The repository documents `https://api.tiyoouw.app`; confirm that this is the API being used. Set `SHARE_API` to the appropriate server-side API URL. Changes to the public variable require a fresh frontend build/deployment.
- Deploy the API changes separately on the VPS with Node.js 22 or newer, install from `server/package-lock.json`, build, and restart the existing API service. Vercel does not deploy this separate service.
- Include `https://photobooth.himasif.id` in the API's `ALLOWED_ORIGINS`, retaining other intended booth domains. Set `FRONTEND_ORIGIN=https://photobooth.himasif.id` if it should be the fallback share-link domain. Browser requests from an allowed booth origin already produce links on that origin.
- Keep any real `FRAME_UPLOAD_CODE` in the API's secure environment configuration. The E2E runner's code is a local fixture and is not a production credential.

## Verify the live site

1. Check the HTTPS API `/v1/health` response is `200` with `{"ok":true}` and that the frontend deployment loaded on `https://photobooth.himasif.id` is the expected commit.
2. Use generated test pictures in desktop and mobile browsers. Exercise photo upload, editing, layout switching, reload/draft recovery, PNG/GIF download, and a camera session with real permission prompts.
3. Share a test design. With the API enabled, expect a short link on `https://photobooth.himasif.id/s/<id>`. An unexpected `#d=` link means the API request failed or remote sharing is disabled; inspect the browser network request and CORS response.
4. Open the short link in another browser/device. Confirm photos, the selected frame, download actions, and "Buka di editor". Check the API OG image contains the actual frame artwork.
5. Scan the enlarged QR on another device and check WhatsApp previews. Verify Web Share on supported phones. These external integrations are not established by headless Chromium checks.
6. Delete the temporary share through "Hapus dari server" before closing/reloading the creating page, then confirm the API design endpoint returns `404`. If testing community uploads, remove the temporary collection entry too; an already selected embedded frame should still export correctly.

The local suite uses temporary databases and simulated camera input. It does not establish production deployment, real-device behavior, or resolution of the dependency vulnerabilities recorded in FINDINGS.md.
