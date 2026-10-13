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

## Dependency follow-up — 2026-10-14

Re-running the original lockfile audit confirmed 10 frontend findings: 1 critical, 7 high, and 2 moderate. These are affected package entries, including transitive effects, rather than 10 independent vulnerabilities. The API audit remained at zero.

- Upgraded Next.js 14.2.15 → 16.4.0, React/React DOM 18.3.1 → 19.3.0, Tailwind 3.4.14 → 4.3.3, and PostCSS 8.4.47 → 8.5.30, including the lockfile.
- Replaced the Tailwind PostCSS plugin with `@tailwindcss/postcss`, removed redundant Autoprefixer, explicitly scoped CSS source scanning to app/components, and retained the existing theme configuration. Updated renamed radius, blur, shadow, and outline utilities to preserve their previous values.
- Migrated shared-page metadata and rendering to async route params and updated the camera ref type for React 19.
- Made the editor inert until shared-link/draft restoration finishes, preventing early clicks after reload from being overwritten by restored state.
- Standardized the documented/CI runtime on Node 22 and added full frontend/API audit checks to CI.

Full frontend, production-only frontend, and API audits now report **0 findings**. This describes known advisories in the local lockfiles on the review date; it is not a claim that production has been patched or that all security risks are eliminated.

Follow-up validation on Windows with Node 22.16.0 / npm 10.9.2:

- Clean frontend `npm ci` completed with zero audit findings; manifest/lockfile consistency and `git diff --check` passed.
- 88 frontend/core/camera tests, 17 API tests, both type checks, and the Next.js 16 production build passed.
- All 15 Chromium scenarios passed after the draft-restoration fix. Production `next start` smoke checks returned 200 for the editor and 404 for an invalid viewer ID.
- Standard API `npm ci` attempted a native SQLite rebuild and failed because Visual Studio C++ build tools are absent on this machine. For this local validation, `npm --prefix server ci --ignore-scripts` succeeded; the packaged SQLite binary was verified with an in-memory query, then API and browser tests passed. This workaround was used only locally; normal API installation and remote CI were not verified on another environment.

## Remaining device validation and deployment limits

Browser checks use headless Chromium and its simulated video device. Physical camera hardware, real permission prompts, audio output, mobile Web Share, real QR scanning/WhatsApp previews, and other browser engines require device/browser validation. Production deployment state was not checked or modified.

| Validation still required | Acceptance check |
| --- | --- |
| Physical camera and real permissions | Over HTTPS, allow/deny permission, select front/rear or USB cameras, unplug/reconnect, and confirm capture/retake preserves existing photos. |
| Audio and fullscreen | Verify optional countdown sound, mute, fullscreen entry/exit, and recovery after backgrounding on real devices. |
| Mobile Web Share | On iOS Safari and Android Chrome, share and cancel; verify downloaded files and copied-link fallback. |
| QR and WhatsApp | Scan a short-link QR with another device and send a production-accessible link to verify the actual OG preview and viewer. |
| Other browser engines | Repeat upload, export, draft, sharing, and camera flows in Safari and Firefox. Tailwind 4 requires Safari 16.4+, Chromium 111+, and Firefox 128+. |

Deploying the upgraded build and checking its live runtime/version remains separate work.
