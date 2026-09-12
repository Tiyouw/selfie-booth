# Custom photo-strip templates

Choose the frame ratio, number of photos, and built-in margin style before downloading templates. Native sizes are 1920 × 1080 (16:9), 1080 × 1920 (9:16), and 640 × 1920 (1:3). Portrait layouts support up to three equal vertical photos; four photos are available as a landscape 2 × 2 grid.

- **SVG guide:** an annotated editing reference with Bahasa Indonesia labels and each photo window's `x`, `y`, `w`, and `h` in native pixels, measured from the top-left corner. The legend names the base frame and shows the gap and all four outer margins. Exact geometry is also embedded in the SVG's `selfie-booth-template` metadata. The dashed 24 px safe inset is a recommendation for keeping text and logos away from the edge, **not print bleed**. Check printer-specific bleed requirements separately.
- **PNG starter:** a clean overlay with a uniform dark fill across borders and gaps, and transparent photo windows matching the selected layout. It contains no photos, labels, or guide annotations. Customize its opaque areas in an editor that preserves PNG alpha; keep the canvas size and window positions unchanged.

The guide is not an uploadable frame. Export the edited starter as a transparent PNG, not JPEG, and import it at the matching ratio; its canvas must exactly match the selected ratio's native dimensions. On upload the app measures the PNG's transparent windows itself (`lib/frameGeom.ts`): the union bounding box of all sizable windows becomes the custom `frameInset`, and the window count is used as the photo-count hint — importing a three-window frame while a different count is selected switches the grid automatically (portrait four-window frames are invalid). The previously selected base frame no longer matters, so a frame built on the Polaroid starter imports correctly even from "Tanpa". Decorations drawn **inside** a photo window stay opaque and will overlap that photo; keep windows fully transparent and place captions in the border margins. Canvas-generated PNGs do not retain the guide's geometry metadata. Layout changes are locked while a custom frame is selected; returning to a built-in frame clears the custom geometry fields.

Both downloads have matching filename prefixes containing the ratio, photo count, base-frame ID, outer insets in **top/right/bottom/left** order, and layout version. For example, `selfie-booth-1x3-3-foto-polaroid-1x3-inset-144-28-240-28-v2-panduan.svg` pairs with the same prefix ending in `-dasar.png`. Custom frames use `kustom`; no frame uses `tanpa-bingkai`. The filename is a reference only; the import measures the PNG's own windows, so the base frame named in the filename does not need to be selected when reimporting.

Old shared links and local drafts retain their original asymmetric portrait-three layout. New sessions use equal rows; choosing a new layout upgrades `layoutVersion` to 2. A guide generated from a legacy session deliberately uses that session's original geometry.

## Persistence

Uploaded frames are also kept in a per-device frame library under the `selfie-booth:frames:v1` localStorage key (max 12 entries; same-src uploads refresh the existing entry). The library survives refreshes and "Mulai baru" by design. The Frame panel lists library frames for the currently selected ratio with a delete button per entry; picking one restores its measured geometry and photo count. If the storage quota is exceeded, the frame is still applied to the design but not added to the library, and a toast explains why.

## Community collection

When `NEXT_PUBLIC_SHARE_API` is configured, the Frame panel also shows the **community collection** (`Koleksi komunitas`) — PNG frames stored on the booth API and visible to every visitor of every booth domain (`GET /v1/frames?ratio=…`, served with the measured inset and window count). Adding one requires the shared access code configured on the API via `FRAME_UPLOAD_CODE` (see `server/deploy/api.env.example`): type it into the code field **before** uploading, and the same upload lands in the community collection and this device. With a wrong or missing code the frame is still applied and saved per-device, with a toast saying so. Deleting a community frame uses the same code (`X-Frame-Code` header). Frames live in the API's SQLite store and are not subject to the 30-day design TTL. Without a configured share API only the per-device library is shown.

Version 3 share payloads include layout version (`l`), custom inset (`i`, ordered top/right/bottom/left), and custom grid (`k`). They contain only visible photos. Local drafts use the same versioned payload but retain all four slots under the existing `selfie-booth:draft:v2` storage key for migration compatibility. Readers accept v1/v2 payloads, legacy `|grid` suffixes, and drafts without suffixes; missing layout versions mean version 1.

## Core checks

No additional test dependencies are required:

```sh
npm ci
npm test
npm run typecheck
```

`npm test` compiles the core and camera TypeScript modules into the ignored
`.hoplite/test-build` directory, then runs both core and camera regression tests.

Regenerate built-in SVG artwork with `python3 scripts/gen-frames.py`. The existing 16:9 and 9:16 designs are intentionally unchanged.
