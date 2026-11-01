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
| `npm run render:sample` | render the sample product to `out/sample.mp4` without the web app (`-- --stills` for key frames, `-- --frames=0,24` for exact frames, `-- --images=1 --lazada --hide-price` for variants) |
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

## Phones, tablets, desktop

| Screen | Layout |
| --- | --- |
| Phone (< 700px) | two tabs, **Edit** and **Preview**, plus a bottom bar with the next action (Preview →, Generate video, or what is still missing). The preview is sized to fit the screen height. |
| Tablet portrait (700–1023px) | form + 330px preview column, side by side |
| Tablet landscape / desktop (≥ 1024px) | form + 380px sticky preview column |

* Touch screens get "＋ Add photos" (opens the photo picker / camera), larger photo
  buttons (‹ move, × remove, › move) and 44px tap targets. Text inputs are 16px so iOS
  doesn't zoom in on focus; the bottom bar respects the iPhone home-indicator area.
* **Save / Share video** uses the phone's share sheet (Save Video to Photos, TikTok,
  LINE…). The MP4 is fetched in advance because iOS only opens the sheet straight from a
  tap. Browsers without file sharing get the Download button.
* The draft (fields + uploaded photos) and the current video are kept in the browser,
  so a reload or switching to another app doesn't lose work. **New** clears them.
* Frame 0 of the video already shows the product, hook and deal price, because apps
  often use the first frame as the cover.

## Template: Multi-angle Slideshow

1080×1920, 30 fps, 9.5s (1–4 images) up to 18.5s (10 images).

| Part | Length | Content |
| --- | --- | --- |
| Hook | 2.0s | cover photo + big hook text + price card, discount sticker pops in |
| Gallery | 1.5s per shot | each extra photo with Ken Burns motion and a slide-in cut |
| End card | 3.0s | "price drop" counter (original → deal price), −% badge, pulsing call-to-action button, "link in bio" |

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

## Deploying (Railway)

`Dockerfile` + `railway.json` build one container with the web app, API and renderer
(Chrome Headless Shell is downloaded at build time). On Railway:

1. New service from the GitHub repo, **root directory `/video-studio`**,
   config file `video-studio/railway.json`.
2. Attach a volume at **`/data`** (uploads, videos and job records live there).
3. Generate a domain. Railway sets `PORT`; the image sets `DATA_DIR=/data`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATA_DIR` | `./data` (`/data` in Docker) | uploads, outputs, job records |
| `RETENTION_DAYS` | `7` | uploads and videos older than this are deleted hourly |
| `MAX_QUEUED` | `5` | videos allowed to wait in line; more get "try again in a minute" |
| `REMOTION_BROWSER_EXECUTABLE` | unset | use an existing Chrome Headless Shell instead of Remotion's |
| `RENDER_SELFTEST` | on | at startup, render one sample frame and log `render self-test ok` / `FAILED` (proves the renderer works in the container); `0` turns it off |

## Phase 0 limits (by design)

* **No login.** Anyone with the link can use it. To limit abuse there is a per-IP rate
  limit (150 uploads / 20 videos per 15 min), a queue cap, automatic deletion after 7 days,
  and `noindex` so search engines don't list it. Add a password before sharing the link widely.
* Videos render one at a time. Job records are saved as JSON in `DATA_DIR/jobs`, so the
  "Recent videos" list survives restarts; a render cut off by a restart is marked failed.
* Files are stored on local disk / the Railway volume, not object storage.
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
