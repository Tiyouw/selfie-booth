# End-to-end findings

Reviewed and tested on 2026-10-13. Changes are in the working tree; this is a record of local validation, not a production deployment or remote CI result.

## Fixed

| Finding | Correction and coverage |
| --- | --- |
| Community overlays disappeared when drafts or shared designs were reloaded | Selected PNGs are embedded in the design. Browser checks cover reload, sharing, OG artwork, and export after collection deletion. |
| Built-in overlays were absent from API previews | Corrected the asset path from the compiled server module. Browser and API tests check actual border pixels. Preview corner radii now scale with the export geometry. |
| Share dialog close controls were clipped on short mobile screens | Bounded dialog height, a fixed header, and an independently scrolling content area; tested at 320×568. |
| Keyboard focus escaped the share/QR dialogs | Focus trapping, initial focus, background scroll locking, and focus restoration. |
| Header actions caused horizontal overflow on narrow phones | Reduced mobile spacing and added explicit accessible button names. |
| Empty-slot camera/upload controls were clipped in mobile four-photo layouts | Compact icon controls keep both actions within the slot; tested against their actual bounds. |
| Four-window portrait PNGs were accepted despite a three-photo layout limit | Imports require 1–3 portrait/strip windows or 1–4 landscape windows, matching the API. |
| Frame storage failures were reported as successful device saves | Quota failures explicitly describe an applied but unsaved frame; browser storage failure is exercised. |
| Delayed photo uploads overwrote a newly reset design | Per-slot request versions invalidate uploads on reset, replacement, reorder, and camera confirmation. |
| An older share request replaced a newer link | Request versions invalidate stale success/error/loading updates after closing or reopening sharing. |
| Multipart requests without Content-Length bypassed the total upload limit | Hono body-limit middleware checks streamed bodies; API regression test expects 413 and no stored row. |
| Multibyte JSON exceeded the advertised byte limit while passing the character count | Design size is measured as UTF-8 bytes; emoji payload regression test expects 413. |
| The API claimed Node >=20 while its SQLite dependency requires >=22 | Aligned the API manifest and lockfile with the dependency and CI runtime. |
| Shared viewers failed when SHARE_API ended with a slash | Normalize the viewer API URL. Browser services deliberately use a trailing-slash SHARE_API. |

Added `npm run test:e2e`, its Playwright development dependency, an isolated server/database runner, and a browser CI job. The runner checks ports before startup, applies case deadlines, fails on zero selected cases, records results/screenshots/logs, and stops its own processes and removes temporary data.

## Validation

- 15 Chromium browser scenarios: uploads/editing/reorder/deletion, hidden photos and drafts, PNG/GIF downloads, templates and custom library, community persistence/deletion, rendered server artwork, viewers/QR/share deletion/fallback, small-screen layouts/focus, invalid frames, quota failure, upload/share races, camera permission denial, capture/pause/retake/confirmation, and multi-photo capture preserving existing slots.
- 88 frontend/core/camera tests and 17 API tests passed.
- Frontend and API type checks passed.
- Frontend production build passed. Google Fonts optimization remains blocked by the cloud network policy; the build uses its supported fallback.
- Manifest/lockfile consistency and `git diff --check` passed.

See README.md in this directory for running the suite. Current browser results and service logs are under `.hoplite/artifacts/e2e/`.

## Remaining findings and limits

The frontend dependency audit reports 10 findings: 1 critical, 7 high, and 2 moderate, involving Next.js, PostCSS, Tailwind and related packages. The API audit reports zero findings. A framework/dependency upgrade remains necessary; the functional fixes do not resolve those vulnerabilities. The repository already documents dependency risk in DEPLOY.md.

Browser checks use headless Chromium and its simulated video device. Physical camera hardware, real permission prompts, audio output, mobile Web Share, real QR scanning/WhatsApp previews, and other browser engines require device/browser validation. Production deployment state was not checked or modified.
