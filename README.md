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
