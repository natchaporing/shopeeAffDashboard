# Video Studio (Phase 0)

Turn a product into a short vertical video for affiliate posts: paste the Shopee / Lazada
affiliate link, upload product photos, pick a template, get an MP4 plus a ready-to-paste caption.

Phase 0 proves the core loop: **upload → pick template → live preview → render → download**,
with 7 built-in templates (4 photo slideshows, 2 AI-clip templates with master prompts, 1 for
your own footage) and a **Templates** page to make your own. No login and no database yet;
no AI video model is connected yet (AI templates give you the filled prompt to use in your AI
tool, then you upload the clip).

## Quick start

```bash
cd video-studio
npm install
npm run dev            # http://localhost:3000  (web app + API + live preview, one process)
```

Click **Sample** to fill the form with demo data, or upload your own photos.

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
| `npm run render:sample` | render the sample product without the web app: `-- --template=flash-sale` (any built-in id), `-- --all --stills` (key frames of every template), `-- --frames=0,24`, `-- --template=own-clip --clip=path.mp4`, `-- --images=1 --lazada --hide-price` |
| `npm test` | unit tests (formatting, timeline plan, caption, links, request validation, templates, styles, store, queue) |
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

* **One video codebase.** Each engine is a React component (`src/remotion/templates`).
  The web preview (`@remotion/player`) and the server render (`@remotion/renderer`) run the
  same code, so the preview matches the MP4. Templates are data on top (see below).
* **Images are prepared in the browser** (`src/web/prepareImage.ts`): EXIF rotation applied,
  longest side capped at 2160px, re-encoded to JPEG (PNG kept for transparency). HEIC is
  rejected with a "export as JPG" message.
* **The renderer only loads files this server stores** (`/uploads/…`, `/samples/…`). Remote URLs
  are rejected so the headless browser can't be made to fetch arbitrary addresses. Media files
  are served with `Access-Control-Allow-Origin: *` because `@remotion/media` fetches clips from
  the renderer's own origin.
* **Clips are measured on upload** (`mediabunny`, `src/server/media.ts`): duration and size are
  stored next to the file and override whatever the browser sends.
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

## Photo permission

Photos copied from a shop's listing usually belong to the seller or brand. Under **Photos**
the Create page shows a warning and a required checkbox (English + Thai):

> I took these photos and clips myself, or the shop / brand that owns them gave me
> permission to use them in my videos.

* **Generate stays locked until it is ticked.** The server checks it too (`rights` in
  `POST /api/jobs`), so it can't be skipped by calling the API directly.
* The tick covers the exact photos and clip present when it was ticked: adding, removing or
  swapping a photo or the clip clears it (reordering doesn't). It survives a reload.
* Each video's job record (`DATA_DIR/jobs/<id>.json`) keeps the statement, its version and
  the time it was confirmed (`rights`). The wording lives in `src/shared/rights.ts`; changing
  it means bumping `version`, which asks everyone to confirm again.
* This is a confirmation and a record, not a legal check: the app can't know who owns a photo.

## Templates

**Template = engine (code) + style (data) + optional master prompt (data).**

| Part | Where | Who changes it |
| --- | --- | --- |
| Engine | `src/remotion/templates/Slideshow.tsx`, `ClipOverlay.tsx`, registered in `src/remotion/engines.ts` | code |
| Style | `styleSchema` in `src/remotion/style.ts`: button colour, sticker colour, background (blurred photo / solid / gradient), text on background, price card (white / dark / glass), hook (outlined pop / label box / clean), sticker (circle / starburst / tag), pace (fast / normal / slow), transition (slide / zoom / fade), ribbon text | **Templates page**, no code |
| Master prompt | `masterPrompt` + `options` per `{placeholder}` in `src/shared/templates.ts` | **Templates page**, no code |

Built-in templates (`BUILT_IN_TEMPLATES`): **Classic Slideshow** (id `multi-angle-slideshow`),
**Flash Sale**, **Minimal Beauty**, **Gadget Dark** (slideshow engine), **AI Hero Shot**,
**AI Lifestyle** (clip engine + master prompt), **Your Own Clip** (clip engine, no prompt).
Custom templates are JSON files in `DATA_DIR/templates` (on the Railway volume), made on the
Templates page: start from a blank look / AI template / own-clip template, or **Duplicate**
any template. Built-ins can't be edited or deleted. The editor shows a live preview on the
sample product and blocks saving while something is wrong (e.g. `{mood}` in the prompt with
no choices).

### Engines

**Slideshow** (photos): cover + hook, 3+ gallery shots with Ken Burns motion inside a
product card, price card, sticker, end card with the price-drop countdown and a pulsing
call-to-action. 9.5–18.5s at normal pace. Works with 1 photo (adds zoomed detail shots).

**Clip** (video): your clip full screen (cropped to 9:16, first 20s), hook on top, compact
price card + sticker, then the end card. Until a clip is uploaded, the cover photo stands in
so the preview works.

Both engines: frame 0 already shows product, hook and deal price (apps use it as the cover);
nothing important below y=1580 or in the right-hand button column (TikTok / Reels UI);
titles are cleaned (`【พร้อมส่ง】`, `[ของแท้100%]` removed); **Hide exact price** shows
"ราคาพิเศษ" + discount % instead.

### Master prompts (AI templates)

```text
Vertical 9:16 premium product commercial. The {product} from the reference image stays
exactly the same: same shape, label, text and colors. It stands on {surface} in {setting}.
Camera: {motion}. {lighting}, shallow depth of field, photorealistic. No added text.
```

* `{product}` is filled from "Product in English" on the Create page; every other
  `{name}` needs a list of choices, which become dropdowns.
* Keep text, prices and Thai out of the prompt: AI video models garble them. The engine adds
  hook, price and button on top as crisp Thai text.
* **No model is connected yet** (`AI_VIDEO_PROVIDER=manual`): the Create page shows the
  filled prompt (Copy prompt / Copy negative prompt / Reference photo), you make the clip in
  your AI tool (Kling, Seedance, Veo…), then upload it. Connecting a model later means one
  provider module that takes `{prompt, negativePrompt, reference image, seconds}` and returns
  a clip; the rest of the flow stays the same.

### Adding an engine (code)

1. Create `src/remotion/templates/MyEngine.tsx` taking `ProductVideoProps` (use `props.style`
   and the components in `src/remotion/components`).
2. Register it in `ENGINES` (`src/remotion/engines.ts`) and add its id to `ENGINE_IDS`
   (`src/shared/templates.ts`). It then works in the Studio, the server and the editor.

## Deploying (Railway)

`Dockerfile` builds one container with the web app, API and renderer (Chrome Headless Shell
is downloaded at build time). Railway has deprecated `railway.json`, so the live service has
these settings set directly (the file mirrors them for reference):

1. Service from the GitHub repo, **root directory `/video-studio`**, Dockerfile builder,
   watch path `/video-studio/**`, healthcheck `/api/health`, start command
   `node --import tsx src/server/index.ts`.
2. A volume at **`/data`** (uploads, videos, job records, custom templates).
3. A generated domain on port 3000 (`PORT=3000`).

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATA_DIR` | `./data` (`/data` in Docker) | uploads, outputs, job records |
| `RETENTION_DAYS` | `7` | uploads and videos older than this are deleted hourly |
| `MAX_QUEUED` | `5` | videos allowed to wait in line; more get "try again in a minute" |
| `REMOTION_BROWSER_EXECUTABLE` | unset | use an existing Chrome Headless Shell instead of Remotion's |
| `RENDER_SELFTEST` | on | at startup, render one sample frame and log `render self-test ok` / `FAILED` (proves the renderer works in the container); `0` turns it off |
| `ADMIN_KEY` | unset | when set, creating / editing / deleting templates needs it (the Templates page asks once and remembers it) |
| `AI_VIDEO_PROVIDER` | `manual` | `manual` = copy the prompt and upload the clip; reserved for a connected model later |

## Phase 0 limits (by design)

* **No login.** Anyone with the link can use it. To limit abuse there is a per-IP rate
  limit (150 uploads / 20 videos per 15 min), a queue cap, automatic deletion after 7 days,
  and `noindex` so search engines don't list it. Anyone can also add or delete *custom*
  templates (built-ins are protected) unless `ADMIN_KEY` is set. Add a password before
  sharing the link widely.
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
* Connect an AI video model (choice pending): a "Generate clip" button replaces copy-prompt-and-upload.
* "3 reasons" engine with Thai voiceover + word-timed subtitles (needs a TTS key).
