# Video Studio (Phase 0)

Turn a product into a short vertical video for affiliate posts: paste the Shopee / Lazada
affiliate link, upload product photos, pick a template, get an MP4 plus a ready-to-paste caption.

Phase 0 proves the core loop on one machine: **upload → live preview → render → download**.
No login, no database, no AI yet (see the roadmap below).

## Quick start

```bash
cd video-studio
npm install
npm run dev            # http://localhost:3000  (web app + API + live preview, one process)
```

Click **Load sample product** to fill the form with demo data, or upload your own photos.

The first render downloads Chrome Headless Shell (~100 MB) unless you point Remotion at an
existing one:

```bash
REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell npm run dev
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build && npm start` | production: serves the built web app from `dist/web` |
| `npm run studio` | Remotion Studio, for designing templates frame by frame |
| `npm run render:sample` | render the sample product to `out/sample.mp4` without the web app (`-- --stills` for key frames only, `-- --images=1 --lazada --hide-price` for variants) |
| `npm test` | unit tests (formatting, timeline plan, caption, link detection, request validation) |
| `npm run typecheck` | TypeScript check |
| `python3 scripts/make-sample-images.py` | regenerate the synthetic sample photos in `public/samples/` |

## How it works

```
Browser                                  Server (Express)                 Remotion
───────                                  ────────────────                 ────────
pick photos → resize/rotate in canvas →  POST /api/uploads  → data/uploads/
form + photos → <Player> live preview    (same React template as the render)
Generate    →                            POST /api/jobs (validate) → queue → renderMedia → data/outputs/<id>.mp4
poll        →                            GET  /api/jobs/:id  → progress, MP4 url, caption
```

* **One template codebase.** Each template is a React component (`src/remotion/templates`).
  The web preview (`@remotion/player`) and the server render (`@remotion/renderer`) run the
  same code, so the preview matches the MP4.
* **Images are prepared in the browser** (`src/web/prepareImage.ts`): EXIF rotation applied,
  longest side capped at 2160px, re-encoded to JPEG (PNG kept for transparency). HEIC is
  rejected with a "export as JPG" message.
* **The renderer only loads files this server stores** (`/uploads/…`, `/samples/…`). Remote URLs
  are rejected so the headless browser can't be made to fetch arbitrary addresses.
* **Thai font is bundled** (Kanit, SIL OFL, `public/fonts`), so renders don't depend on
  Google Fonts. Icons are SVG, not emoji, so no emoji font is needed on the render machine.
* **Caption** (`src/shared/caption.ts`): hook + cleaned title, price drop, rating / sold,
  affiliate link, hashtags.

## Template: Multi-angle Slideshow

1080×1920, 30 fps, 9.5s (1–4 images) up to 18.5s (10 images).

| Part | Length | Content |
| --- | --- | --- |
| Hook | 2.0s | cover photo + big hook text, discount sticker pops in |
| Gallery | 1.5s per shot | each extra photo with Ken Burns motion and a slide-in cut; price card with a "price drop" counter (original → deal price) |
| End card | 3.0s | price, crossed-out original + −%, pulsing call-to-action button, "link in bio" |

* **Works with 1 image.** With fewer than 3 gallery photos, the template adds zoomed
  "detail" shots that focus on different parts of the photos.
* **Hide exact price** shows "ราคาพิเศษ" ("special price") and the discount % instead, for
  videos that stay up after the price changes.
* **Safe zones**: nothing important below y=1580 (caption / shopping basket area) or in the
  right column (like / comment / share buttons).
* Marketplace titles are cleaned automatically (`【พร้อมส่ง】`, `[ของแท้100%]` tags removed,
  cut at ~48 characters on a word boundary).

### Adding a template

1. Create `src/remotion/templates/MyTemplate.tsx` taking `ProductVideoProps`.
2. Add an entry to `TEMPLATES` in `src/remotion/templates/registry.ts` (name, image limits,
   duration function).

It then shows up in the web gallery, the Studio, and server-side validation.

## Phase 0 limits (by design)

* Jobs live in memory and render one at a time; a restart forgets the job list (files stay in `data/`).
* Files are stored on local disk in `data/`.
* No auth. **Don't expose this server to the internet as-is.**
* Rendering speed depends on CPU: the 9.5s sample took ~60s in a small cloud container.
* Remotion is free for individuals and companies of up to 3 people; larger companies need a
  company license.

## Next (Phase 1 MVP)

* Supabase: auth, `products` / `assets` / `render_jobs` / `videos` tables, Storage with signed
  browser uploads (replaces `data/` and the in-memory queue).
* A separate render worker (Railway) that claims jobs with `SELECT … FOR UPDATE SKIP LOCKED`.
* Shopee link auto-fill: resolve the short link → `itemId`/`shopId` → `productOfferV2`
  (signed client already exists in `../shopee_aff/shopee_client.py`).
* Per-video `subIds` via `generateShortLink`, so the dashboard can show which video earned what.
* Template 2: "3 reasons" with Thai voiceover + word-timed subtitles (needs a TTS key).
* Real-footage template (user video clips + overlays).
