# Portfolio — notes for Claude Code

Personal portfolio for Kaung Myat Soe. Loads automatically into every Claude Code
session opened in this folder. Keep it short and portfolio-only.

## What it is

Two-screen personal site. 100vh ink "K" hero on paper, then the project list on a light
paper page with a 12-column grid. Scroll timeline: the ink floods out of the K and covers
the screen, drains away from the centre to reveal the grid page, then each project name
crawls in from the side like a snake and settles into place.

- Owner: Kaung Myat Soe (personal, not OOm work)
- Live: https://kaungmyatsoe13.github.io/
- Repo: https://github.com/KaungMyatSoe13/KaungMyatSoe13.github.io
- Old site being replaced: http://kfolio.online/

## Tech

- Next.js 15 (App Router) with `output: "export"`, built to `./out`
- Tailwind v4, Inter Tight + JetBrains Mono from `next/font/google`
- Hero is a WebGL2 fluid (ink) simulation, with an SVG fallback (see `src/components/InkHero.tsx`)
- Deploys on every push to `main` via `.github/workflows/deploy.yml` (GitHub Pages)

## Home page structure (current)

- `/` = `<InkHero arcade>` + `ArcadeShowcase` pinned under it. Arcade mode: no K (empty home
  mask, no fill intro, no SVG K), the ink layer is clear (`u_clear`: alpha = ink, no paper or
  grid) and its canvas is invisible: ArcadeShowcase reads it each frame as a texture
  (`tInk`, InkHero uses preserveDrawingBuffer in arcade mode) and draws it BEHIND the arcade
  (paper → ink → arcade → cards), so the ink floods out from behind the machine. Corner
  texts in plain ink (`data-arcade`: no difference blend). The flood grows
  from, and the drain opens back to, the arcade screen's centre (`floodOrigin` in
  `src/lib/stage.ts`, set by ArcadeShowcase from the projected screen). /lab keeps the K.
- (before that: the ink K landing) `InkHero` + `ArcadeShowcase` pinned
  under it (`.sc` sticky, margin-top -200svh). The ink floods (covered by 0.35) and drains
  (0.38 → 0.62); the arcade's turn follows it: `tp` = (ps − 0.3) / 0.42 blends two camera
  poses (`poseAt`: whole cabinet from its right → close on the screen from its left) and the
  cabinet spins once round (`spinIn`, ease-out), so it is moving while the ink drains. The
  arcade screen shows the K (`drawKFace`) until ps 0.52, then glitches to the project; texts
  glitch in at 0.66 (`data-calm` skips it after a project); cards drop from above at 0.7
  (gravity, squash, arcade jolt + post kick), lift away below 0.6. Wheel: ONE project per
  gesture. After a step the wheel locks until a new gesture: a 180 ms pause (by
  `e.timeStamp`), or, in a momentum tail (below 25% of its peak for 4 events running), a
  jump to 3× its low point (a second flick). Steps ≥200 ms apart; the page scroll's tail
  never steps. Tested: one flick, a long uneven drag, 2–3 quick flicks, mouse notches.
  Touch: one step per swipe. (An arcade-only landing with no ink was tried and the owner brought the ink back.)
- Opening a project (owner's idea: "dragged inside the arcade"): click → the arcade errors
  (SHAKE_MS: hard jumps, the screen glitches with a flickering red ERROR bar, post kick),
  then `poseAt(e, dv)` pulls the camera down the screen's normal until the screen overfills
  the view (DIVE_MS), the lens flattening to nothing (`bendNow`; the shader's edge term
  scales with it, `lensInvK` matches) and the cards swept off right; then the still +
  outline hand-off, so the project room grows out of a full-view screen. Close: the project
  page ends on that same outline (no ghost of the home text any more) and the home page,
  seeing `back`, starts inside the screen and pulls back out (OUT_MS).
- Showcase layout (owner's wireframe: arcade left, game cards on an arc
  right; no particles, no BMO). Arcade = "Arcade machine Street Fighter" by bvbwork510524
  (was "Final Fight Arcade" by brysew; Street Fighter art is Capcom's IP; the model's red
  "J·S·♡" marker scrawl under the screen is painted out in all four of `arcade.glb`'s maps at
  x 590–629, y 242–336; a small red-marker "K+S" (tilted 45°, leaning left) sits in the panel's bottom-right corner as a
  sharp decal (`drawKS` canvas on a plane in the rig, placed by `surfaceAtUv` at `KS_UV`,
  facing front; the texture there is too low-res to paint letters into)), card = "DS game
  card" by maney, both Sketchfab CC BY 4.0 (`public/showcase/arcade.glb`, `card.glb`,
  textures recompressed; credit line `CREDIT` in `.sc__credit`, keep it). Final Fight art is
  Capcom's IP. Framed close on the screen (screen = 30% of the height; phones 56% of the
  width), ¾ view from its left; the cabinet runs off the bottom (the owner tried the whole
  cabinet and went back). The cards are their OWN layer (`rtC`, `ccam` zoom 1), composited
  flat in the post pass with the same glitch shifts but no lens, so they run off every edge
  (the lens + a limited render area cropped them). Hint text sits under "Selected work".
  The scene renders OVER = 1.5× wider than the screen (camera.zoom 1/OVER, view offsets
  ÷ OVER, post `uOver`) so the lens never cuts things off near the edges: cards run off
  the screen. `fit()` only resizes when the size really changes (a resize clears the
  canvas: that was a one-frame black flash on return). Its `Screen` mesh shows `drawScreenFace`
  (`src/lib/screenFace.ts`: arcade attract screen: 1UP / 0n/05 / type year, the name in
  Doto with drop shadow + glow, synthwave grid, blinking PRESS START). Cards: the model is
  re-oriented from its UVs (`prepareCard`: label normal → +z, label top up) and each gets
  its own label painted over the original (`src/lib/cardLabel.ts`: code strip, coloured
  panel with the project `summary`, name, rating-style type box, K + KFOLIO, stack; the
  original label was a real game's, never show it). Cards sit on a wheel (separate scene +
  camera, `cardPose`: desktop arc to the right, CARD_STEP 0.56, ±2 half off-screen; phones a
  row at the bottom); wheel/swipe/arrows step one card, the arcade screen glitches to the new
  name. Drag a card to turn it any way, all the way round (`spin`, with a throw); a drag is
  not a click; cards that leave the front turn back to face you.
  Click a card (non-active: it comes to the front; active: open) or the arcade → project
  page; the hand-off outline is the arcade screen's (UV grid → project → `lensInv`), so the
  room grows from behind it. Project page opening: first exactly the home screen's shape in
  perspective (`u_hinv` = inverse homography of the outline's 4 corners, `u_qs`; kept near
  the screen's box because perspective runs away), then a rounded box (`u_scale`, growing
  as grow^2.4) takes over and always ends covering the whole view (`cover`). Unused, kept
  for reference: `ComputerShowcase`, `BmoScreen`, `BendShowcase`, `cardFace` (+ their
  assets in `public/showcase`).
- `/lab` = the previous home (InkHero + staircase `ProjectList`), kept for reference.

## About page

- `/about` = `src/components/AboutStory.tsx`, content in `src/content/about.ts` (facts from
  the CV). Five sections (owner is going section by section; ref inacionakiti.com,
  reference only): (01) About me — the name line glitch-loops between `name` and `alias`
  ("Aka K,") via `AltName`, in Inter Tight like the rest (Doto was tried); text left, the photo
  (`public/about/me2-cut.webp`: the owner's improved B&W mirror selfie; it came with a fake
  checkerboard baked in, removed by flood-filling pixels that have both checker tones nearby,
  plus a hand-traced patch for the ear/jaw where light skin met the light checker;
  older `me.jpg` / `me-cut.png` kept; a night photo was tried and rejected) rebuilt from WebGL
  particles, centred behind the text, brightness stretched so the figure reads as lit;
  sampled 460 wide with an unsharp mask first, dots per pixel follow brightness like a
  halftone (dark glasses/phone/shadows stay nearly empty), dot size 1.6 px: this is what
  makes the face readable (earlier: ≥1 dot per pixel at 340 wide, 2 px dots = mushy face);
  hovering the figure: reveal radius REVEAL_R 0.3 and the cursor ring grows to the same
  size (`html[data-cursor-big]`, `--cursor-big`), a lens onto the real photo; normal size elsewhere;
  flat (a 3D relief that turned with the pointer was tried and removed: owner wants just the
  image). HB 0.86 + DY: stands on the bottom edge;
  hovering the figure parts the particles and reveals the real photo in a soft circle;
  A particle Myanmar (big section, then a small note) was tried and removed.
  (02) What I do — `skills` in about.ts (Discover, Design, Architect, Build, Launch,
  Maintain), each with an icon drawn in `drawIcon` (magnifier, browser wireframe, 3-tier
  system, code editor, rocket rising out of an open box, gear with a check mark).
  After Maintain the stage particles travel into the first experience year (`yr`, w[7]),
  placed where the sticky year canvas will stick (`stickY`), then cross-fade to that canvas.
  On the way, particles thin out (`u_keep`, by `a_seed.z`) to about YEAR_N/N, so the stage
  matches the year canvas's lighter density when it arrives.
  Particle canvases shift with the pointer exactly like the text (`turnClip`). Section is one screen per skill with a sticky inner; the portrait
  canvas is FIXED full-screen and its particles morph (shader weights `w[7]`, loose swirl
  mid-way) from the photo into each step's icon (`iconPoints` samples `drawIcon`), then fade as Experience arrives. Left text glitches in
  (`.gx-text`, fill-mode backwards so the tilt transform still applies). Note: `.ab` must
  not have `perspective` (it breaks position: fixed); tilts use `perspective()` in transform.
  Liquid pointer (`makeSmear`): a 128² half-float displacement field per WebGL context;
  the pointer drags into it, it fades (0.955/frame) and blurs, and the portrait/icons and
  the experience years sample it in the vertex shader, so particles move and drift back.
  (03) Experience — sticky big year in particles on the left that swirls and re-forms
  when the timeline entry nearest the screen middle changes year; timeline on the right.
  A fixed `CrtBackground` canvas draws a curved TV grid (same curve as the landing). All
  canvases share a `crt()` shader (curve + the landing's exact glitch: `GLITCH`/`glitchX` =
  per-line wobble, tear bands and the ~14 s rolling tracking band with a glow in the grid;
  one shared clock `u_clk` = `clk()` so every canvas glitches on the same lines; the old
  straight CSS band was removed), measured on the viewport via
  `u_rect`) and a shared eased pointer `turn`: the view and the text (--mx/--my, same
  transform as the project page HUD) move against the pointer; the DOM gets scanlines, a rolling band, vignette and occasional text jumps.
  (04) After hours — "channel surfing": `AfterHours` + `afterHours.hobbies` in about.ts
  (Football, Game, Music, Coding; one-line notes drafted, not confirmed). Guide names in
  Inter Tight 800 (Doto stays on the OSD only). One screen: an old-TV
  channel guide on the left (selected row inverted, Doto), OSD top right ("▶ PLAY", big
  "CH 0n"), the hobby line bottom left and a segmented volume-style bar that times the
  auto channel change (CH_MS, only while the section is on screen; clicks restart it).
  Where the sticky year lets go (`unstickY`), the stage takes the last year back (`yr2`,
  w[8]) and turns it into the channel's 3D object (w[9]): `shapePoints` → ball (pentagon
  patches), pad, note (♫) and code ("</>" + code lines) (flat drawings given depth by `extrude`),
  attributes o0..o3, each with its own rotation (`u_rot[4]`) and mixed by `u_ow` (shared
  channel = module `tv.ch`); a channel change swirls the particles loose. Far side dimmer.
  Rejected: music/games lists (too close to the reference), a black hole with orbiting
  hobbies, and a curved WebGL VHS band (the straight CSS band stays).
  (05) Contact — `Contact` + `contact` in about.ts. Form (name, email, message) beside a
  3D old TV (`ContactTv.tsx`, three.js, lazy-loaded near the section, `public/about/tv.glb`).
  The TV's screen mesh (`Plane*`) gets a canvas texture fitted to its UV box: static +
  "NO SIGNAL" until you type, then "FROM:" + your message, teletext style; SENDING / THANK
  YOU on submit. The site is static, so submit opens a prefilled `mailto:` (no backend).
  From After hours into Contact the particles fly apart and draw the form (`fm`, w[10],
  attribute 15 = the last free slot): `buildForm` paints the title, label text, field
  underlines and the button (text cut out) at their spot for scroll `formY` (desktop: the
  section top; phones: form top − 14vh, capped at the page bottom), in the stage canvas's
  own units, and `u_fmy` moves them with the scroll. Near `formY` the swap is a GLITCH, not a
  fade (owner's request): the stage sets `.ab__form[data-live]` (hidden when off, `gx-text-in`
  when on) and the particles flicker out over ~0.36 s with slices jumping (`u_glitch`);
  reversed when scrolling back. Autofilled fields are kept dark (-webkit-autofill).
  The TV can be dragged to turn (with a short throw); ~2.5 s after release it turns back to
  face you, since the screen shows the message. "↻ Drag to turn" hint under it.
  The model is "vintage old TV" by FArHAn's 3D worKs (Sketchfab), CC BY 4.0: the credit
  line under the form is required, keep it. Its 4096² texture was downscaled to 1024
  (6.5 MB → 1.6 MB).
- Landing is a big CRT: the RENDER shader pushes the picture out toward the corners
  (`TV_CURVE`), so its edges bow (no dark bezel: owner removed it; vignettes kept very light on all pages); the 12-col grid
  + numbers are drawn into a texture (`gridTex`) and sampled on the curve (the HTML
  GridLines is no longer used there).
- Showcase is pinned UNDER the hero for the whole scroll (`.sc` sticky, margin-top
  -200svh, `.home` min-height 200svh, flow-root). The hero canvas has alpha: once the
  drain starts it outputs alpha = ink, so the drain reveals the showcase already in place.
  `/#work` targets `.work-anchor` after the hero. Showcase progress uses scrollY.
- Landing (`InkHero` RENDER shader) also has the curved-TV look: barrel warp, curved
  tear bands + rolling band, pixel-aligned scanlines (avoid moiré), grain, vignette.

## Page switch (glitch)

- `src/lib/tv.ts` + `TvLink.tsx` (names kept): showcase "About" and About "Selected work" play
  a glitch-out (slices jump, red/blue split, flicker, `.gx-out`) into static (`.gx-noise`),
  navigate, then the next page glitches in (`tvOn` in a layout effect, `.gx-in`), flagged by
  sessionStorage `kfolio:tv`. A TV power-off/on version was tried and rejected.

## Edit content

Two files hold everything the user updates. The rest is layout.

- `src/content/site.ts` — name, role, location, email, résumé, social links
- `src/content/projects.ts` — projects in display order (top = first)

To add a project: make `public/projects/<slug>/`, drop in `cover.webp` (~1200 wide) and
an optional `preview.mp4` (muted, 5–8 s, 720 wide), then add an entry. `README.md` has
the ffmpeg and cwebp commands.

## Layout decisions worth keeping

- The hero is **1 screen**, the work list is **1 screen**. Total is 200svh. The work list
  uses `margin-top: -100svh` and sits (transparent) over the ink-hero's sticky stage. The
  stage canvas paints the paper/ink; the work section only adds grid lines and dark text.
  Timeline constants: `FLOOD_END`, `DRAIN_START`, `DRAIN_END` in `InkHero.tsx` (fractions
  of one screen of scroll). The crawl is driven by `--g` set in `ProjectList.tsx`.
- The K (`src/lib/kMark.ts`) follows the owner's own drawing: heavy stem with a rounded
  notch bitten out of its upper left, a thick arm with a round top, and a leg that curls
  up into a tall rounded foot, and a round hole in the arm's top (owner's request). Fills, one stroke and a cut-out in a 100×100 box.
  Inspired by neuv.fr's organic "N", but not a copy: don't add neuv's pill-shaped slot.
- The hero is a real fluid sim (stable fluids: splat → curl/vorticity → divergence →
  20 Jacobi pressure steps → projection → advection) on a ~1/6-res velocity grid. An ink
  "dye" field is advected and relaxed back toward the blurred K ("home"), then thresholded
  at 0.5 with a small blur so edges stay round. The scroll "flood" grows from the centre
  with a noise front. Scroll easing is time-based, so slow devices still finish the flood.
  Cursor reach/strength: `STIR_RADIUS` / `STIR_FORCE` at the top of `InkHero.tsx`.
- The K is solid ink. A dotted "particle look" was tried and reverted at the owner's request.
- A 3D particle-bead K (igloo.inc style) was tried and rejected; keep the 2D liquid K.
- Intro / loading screen: on the first visit per session (sessionStorage `kfolio:intro`,
  only from the top of the page, not with reduced motion) the big K starts empty and a
  stream pours in from the top, filling it from the bottom with a wavy surface (FILL_S).
  The fill holds at 90% until window `load`, so it doubles as the loader. The K fills up from
  the bottom by itself (no pouring streams: owner removed them) with a gently sloshing
  surface; it wobbles like jelly while filling (`u_jelly`) and squash-and-stretches once
  full (`u_jiggle`). Corner text and list labels use timed CSS transitions
  (`data-corners` on `.ink-hero`, `data-labels` on `.work`), not scroll-linked opacity, so
  they fade smoothly however fast you scroll. The SVG K is shown only when WebGL fails
  (`data-fallback`), never while the liquid K starts up. No separate small loading logo.
  Skipped when arriving at `/#work`; the scroll easing snaps for the first 0.5s.
- Page transitions use a hand-off (`src/lib/scatter.ts` + `TransitionLayer.tsx` in the
  root layout): the leaving page writes its particles' screen positions; the layer keeps
  drawing them during the route change; the next page starts its particles from exactly
  those spots and fires `kfolio:particles-ready`, then the layer fades. Home → project:
  names scatter. Project → home (`BackLink`): the layer bursts the image + title into
  particles, then the list's names regather from them.
- The logo is now a pixel K (arcade style, our own grid in `src/lib/pixelK.ts`: yellow
  #ffd21f blocks, 1-cell black outline + drop shadow down-right): `KLogo.tsx` (top bars) and
  `src/app/icon.svg` (favicon, same grid on a dark purple rounded square; regenerate it if
  the grid changes). The arcade's landing screen shows the same pixel K (`drawKFace`).
  Card hover (`CARD_FX` replaces three's map_fragment via onBeforeCompile): ONE glitch
  splash when the hover starts (`uBurst` 1 → 0 over 650 ms: pixelate, ripple, glitch rows,
  colour split), then a moving rainbow "water" coat (`uHover`: a multiply tint + soft sheen,
  no distortion), so the brief stays sharp and readable.
  Arcade screen mapping: the picture is drawn upright on `sc` and mapped onto `tc` by an
  affine fit of the screen mesh's vertices (picture xy → uv), so turned/mirrored screens work;
  the hand-off outline uses the same fit (`toUv`). Screen mesh = material "Screen" or the
  first "glass" (later copies hidden).
- An Ink / Particles switch was tried and removed: ink only.
- Grid lines also show on the landing screen (`work-grid--plain`, no numbers).
- Custom cursor (`Cursor.tsx`, in the root layout): 4px dot on the pointer + 28px ring that
  glides after it (lerp 0.2), `mix-blend-mode: difference`; grows on links, shrinks on
  click; fine pointers only.
- Project hover (orange, dimming) triggers only over the name text itself, not
  the whole row; rows are `width: fit-content`.
- Project names are particles (`src/components/ParticleNames.tsx`, WebGL2 points, CPU
  springs). Each letter is drawn at its DOM spot into an offscreen canvas and sampled every
  1.5px (`step` in ParticleNames.tsx); particles stream in from the right and settle left-first as `--g`-style progress
  runs (same timing: after the drain). The pointer pushes settled particles away and a
  spring pulls them back; the last ~20% of each word frays into slowly drifting, fading
  dust (FRAY_START / DUST_SHARE / DUST_DRIFT) while staying readable (owner wants this kept); the hovered row
  turns accent orange, others dim. No hover preview card (removed at owner's request). The real names
  stay in the DOM (transparent) for links, hover and screen readers; without WebGL2 or
  with reduced motion, the plain text shows. Rejected earlier: scatter-gather, wavy snake,
  straight train.
- Layout: names sit in a staircase on the 12-column grid (row k starts at column k+1,
  `--step` on each `li`); the grid has vertical lines plus horizontal rows 2.4 columns tall.
  Phones: 4 columns, no staircase.
- Corner labels use `mix-blend-mode: difference`. Their opacity is tied to `--p`
  (scroll progress) so they fade before the flood swallows them.
- Hover: the row's particles go orange and other rows dim (in the particle shader). The
  old CSS roll still exists on the transparent text, so it shows only in the text fallback.
- The preview card sits behind the list (`z-index: 0`), list is `z-index: 1`.
- Phones (`(hover: none)` or ≤760px): the preview card is hidden, each project stacks
  as name / tag / summary, and the footer links wrap.

## Project inner pages

- Route: `src/app/projects/[slug]/page.tsx`; everything in `src/components/ProjectDetail.tsx`,
  modelled on fojcikdominik.com's project view. One WebGL scene: room behind (the project's
  `scene` photo in B&W, or a procedural dark room), three screens in a horizontal row
  (fine meshes, middle faces you, sides turned in and partly off-screen), then a
  curved-TV lens + VHS post pass (render to texture). The pointer turns the camera
  (TURN_X/TURN_Y); the HTML text (PROJECT / INFO / ROLE, thumbnails, "> CLOSE <") turns
  with it via --mx/--my. Pictures: `cover` + `gallery`; `role` in projects.ts.
- Slider: drag / flick, wheel or trackpad, arrows, thumbnails, or click a side screen.
  `slide` springs toward an unbounded `target` (picture = k mod n, wraps). Glitch in the
  post pass (whole scene incl. background): per-line jitter (frayed edges), tear bands, a
  rolling tracking band, white tracking dashes, colour bleed; stronger while sliding
  (`u_slide`), off during page transitions (scaled by `u_vhs`).
- Glitch lines are measured in lens-warped coordinates, so they bow with the TV curve.
  The showcase has the same random curved tear bands + rolling tracking band (no white
  dashes), gated by `u_clean`.
- Closing: a copy of the home showcase text (`.sc--ghost`, same classes/positions) fades in
  on the project page (`--ghost`) as the room shrinks, so the text is already there when
  the home page takes over.
- Open: the home labels fade and the clicked screen calms to its plain picture (`u_clean`,
  no VHS glitch), then the home canvas is captured (`src/lib/snapshot.ts`, in memory) and
  the screen's outline saved (`cardGrid`, sessionStorage `kfolio:card`). The project page
  shows that still around the screen and the room grows out from behind the screen as an
  expanding rounded opening (`u_mask` in the post pass) until it covers everything; then
  the screen eases to its slot, side screens slide out, the lens and VHS fade in.
- Close: the reverse — screen back to the same outline, opening shrinks behind it over the
  same still; `kfolio:return` makes the home page show the still until its first frame,
  start on that project with the same pointer offset, neighbours already formed.
  During a page change the home neighbours' dust is frozen (form not updated) and the
  canvas is visible from the first paint on return. Opening edge is feathered (soft bloom);
  OPEN_MS 2100 / CLOSE_MS 1800.
- sessionStorage keys are removed after 1.5s (not at once): React runs effects twice in dev.
- Older particle project pages (`ParticleImage`, `ParticleTitle`, `BackLink`) are unused here.
- KotobaLab background photos (`room-photo.webp`, `shrine-photo.webp`) are git-ignored
  until the owner confirms they're licensed.

## What's intentionally not here

- No separate About page.
- PeakFit has no live/code link (the old site had none either). Don't invent one.

## Commands

```bash
npm run dev     # http://localhost:3000
npm run build   # static site in ./out
npm run lint
```

Don't run `npm run build` while `npm run dev` is running: both write to `.next`, and the
dev server then returns "Internal Server Error". Stop dev first, or if it happens, stop it,
`rm -rf .next`, and start it again.

Local preview of the built site (useful for testing the static export):
```bash
python3 -m http.server 4310 --bind 127.0.0.1 --directory out
```

## Git

- Push with normal `git push`. The repo is pinned to the personal GitHub login
  via a local credential helper, so pushes work regardless of which `gh` account
  is active on the Mac.
- CI runs on every push to `main` and deploys to Pages. Check with
  `gh run list -R KaungMyatSoe13/KaungMyatSoe13.github.io` (needs the personal
  account active).

## Open work

- Project inner pages (per-project detail route).
- Point `kfolio.online` at the Pages site.
- Review the written copy in `site.ts` and each project's `summary` — these were
  drafted and not yet confirmed by the owner.
