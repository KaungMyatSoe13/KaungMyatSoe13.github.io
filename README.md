# K — portfolio

Personal portfolio of Kaung Myat Soe. Two screens: an ink "K" you can push around with the
cursor, which floods the page as you scroll and hands over to the project list.

Built with Next.js (static export) and Tailwind, hosted on GitHub Pages.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static site in ./out
```

Every push to `main` deploys automatically (`.github/workflows/deploy.yml`).

## Edit content

You only need two files.

| What | File |
|---|---|
| Name, role, location, email, résumé, social links | `src/content/site.ts` |
| Projects (order = order on the page) | `src/content/projects.ts` |

### Add a project

1. Make a folder `public/projects/<slug>/`.
2. Add `cover.webp` (about 1200px wide). Optional: `preview.mp4`, a 5–8 s muted clip
   (720px wide) that plays on hover.
3. Add an entry to `src/content/projects.ts`, at the top if it's your newest.

Make the files from a screenshot or a screen recording:

```bash
cwebp -q 80 -resize 1200 0 screenshot.png -o public/projects/<slug>/cover.webp
ffmpeg -ss 2 -t 6 -i recording.mp4 -an -vf "scale=720:-2,fps=24" -c:v libx264 -crf 30 \
  -pix_fmt yuv420p -movflags +faststart public/projects/<slug>/preview.mp4
```

A 3D background (`scene3d` in `projects.ts`): Sketchfab .glb files are mostly big textures.
Shrink them to 512px WebP before adding (the 73 MB Japanese street became 6.4 MB):

```bash
node scripts/shrink-glb.cjs model.glb public/projects/<slug>/place.glb --tex 512
# many small objects: merge them (one piece per material)
node scripts/shrink-glb.cjs model.glb out.glb --tex 512 --merge --ratio 0.3 --error 0.004 --drop-tangents
# millions of triangles: simplify the big meshes
node scripts/shrink-glb.cjs model.glb out.glb --tex 512 --ratio 0.04 --drop-tangents
```

## Change the look

- Colours and spacing: the tokens at the top of `src/app/globals.css`.
- The ink colours are also set in `src/components/InkHero.tsx` (`PAPER`, `INK`).
- The K's shape: `src/lib/kMark.ts` (three thick strokes in a 100×100 box).
- Flood speed: `span` in `InkHero.tsx` (how much scroll the flood takes).

## Where things are

```
src/
  app/            layout, page, global styles
  components/
    InkHero.tsx   WebGL ink K + scroll flood (SVG fallback without WebGL2)
    ProjectList.tsx
  content/        site.ts, projects.ts  ← edit these
  lib/kMark.ts    the K's geometry
public/
  projects/<slug>/cover.webp, preview.mp4
  files/          résumé PDF
```

## Ask K assistant (AI chat)

A chat button on every page answers questions about you. It runs on **Cloudflare Workers AI**
(a free open model, Llama 3.1 8B), through a free Worker in `worker/`. **No Anthropic or Claude
account, no API key, no card.** On the free plan it stops at the daily allowance instead of
charging. Until it's set up, the button simply doesn't show.

Spam is capped anyway: 8 messages a minute per visitor, 400 a day for the whole site
(`DAILY_CAP` in `worker/wrangler.toml`), and a bot check.

One-time setup (all free):

1. Sign up at dash.cloudflare.com (no card needed), then in a terminal:
   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler kv namespace create ASK_K   # paste the printed id into wrangler.toml (PASTE_KV_NAMESPACE_ID_HERE)
   ```
2. **Bot check (recommended):** Cloudflare dashboard → Turnstile → Add widget → domain
   `kaungmyatsoe13.github.io` (+ `localhost`) → copy the **site key** (public) and the
   **secret key**, then `npx wrangler secret put TURNSTILE_SECRET` and paste the secret key.
3. **Deploy:** in the project root `npm run knowledge`, then `cd worker && npm run deploy`.
   It prints the Worker URL, like `https://ask-k.<you>.workers.dev`.
4. **GitHub:** repo → Settings → Secrets and variables → Actions → **Variables**:
   `NEXT_PUBLIC_CHAT_URL` = the Worker URL, `NEXT_PUBLIC_TURNSTILE_SITEKEY` = the Turnstile
   site key. Push (or re-run the deploy workflow) and the button appears.

What the bot knows: `src/content/assistant-facts.md` (edit it; lines starting with TODO are
skipped) plus the site's own content. After editing: `npm run knowledge` and
`cd worker && npm run deploy`. The model is one line (`MODEL`) in `worker/src/index.ts`.

Local test: `cd worker && npm run dev` (Workers AI runs on Cloudflare even in dev, so it needs
`npx wrangler login`), and start the site with `NEXT_PUBLIC_CHAT_URL=http://localhost:8787 npm run dev`.
