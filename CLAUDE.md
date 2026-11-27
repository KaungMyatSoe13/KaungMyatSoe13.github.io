# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Portfolio — notes for Claude Code

Personal portfolio for Kaung Myat Soe. Loads automatically into every Claude Code
session opened in this folder. Keep it short and portfolio-only.

## What it is

An arcade-themed personal portfolio: a light home page (3D Street Fighter arcade cabinet,
floating game cards, ink flood into a project card wheel), a dark About page (particle portrait,
one TV that falls through the page, contact form), five project pages with 3D rooms, an AI chat
mascot (BMO) on every page, and webcam "Hand mode". First visit shows a 1 → 100 loader.

- Owner: Kaung Myat Soe (personal, not OOm work)
- Live: https://k-the.dev/ (domain bought 2026-11-28 at Cloudflare Registrar; GitHub Pages custom
  domain; https://kaungmyatsoe13.github.io/ redirects there)
- Repo: https://github.com/KaungMyatSoe13/KaungMyatSoe13.github.io
- Old site being replaced: http://kfolio.online/

## Tech

- Next.js 15 (App Router) with `output: "export"`, built to `./out`
- Tailwind v4, Inter Tight + JetBrains Mono from `next/font/google`
- Hero is a WebGL2 fluid (ink) simulation, with an SVG fallback (see `src/components/InkHero.tsx`)
- Deploys on every push to `main` via `.github/workflows/deploy.yml` (GitHub Pages)

## Current state (2026-11-26) — read this first

**Published** (live = `main` at 0eef1b2, built and deployed fine): the arcade site, music, loader,
About TV story, 3D project rooms, and the Ask K chat (Worker deployed on Cloudflare).

**Published 2026-11-27** for the owner's testing (pushed to `main`; `DevReport` removed). The chat
Worker's new spam protections are **not deployed** yet (`cd worker && npm run deploy`, when the owner
says "deploy"). What went out:
- BMO as the chat button (`Bmo.tsx`, `public/ui/bmo.glb`), expressions, hover lines, one-line
  footer with a Cloudflare "Privacy" link.
- Hand mode (`HandMode.tsx`, `src/lib/hand.ts`, `public/mediapipe/` ~22 MB (the unused
  `*_module_*` wasm pair and `vision_bundle.mjs` are git-ignored), npm `@mediapipe/tasks-vision`).
- Never commit `public/projects/kotobalab/room.webp` (licence unconfirmed);
  `public/hand-test/` is a git-ignored temporary test page (delete once Hand mode is approved).

**Waiting on the owner:** testing Hand mode on a real webcam (tune the numbers at the top of
`hand.ts`: pinch on/off, swipe speed, palm hold, smoothing; and the fist scroll gain in
`HandMode.tsx`); filling the TODO lines in `src/content/assistant-facts.md` (availability,
hobbies), then `npm run knowledge` and `cd worker && npm run deploy`.

**How to publish:** commit (without room.webp), `git push origin arcade-showcase`, then
`git push origin arcade-showcase:main`; watch with
`GH_TOKEN=$(gh auth token -u KaungMyatSoe13) gh run watch ...` (the active `gh` account is the
work one, don't switch it). The repo variable `NEXT_PUBLIC_CHAT_URL` is already set. If the
Worker changed, deploy it separately (`wrangler` is logged in to the owner's Cloudflare).

**Local dev:** `npx next dev` (webpack; `npm run dev`'s Turbopack has exited silently while
compiling on this Mac). Add `NEXT_PUBLIC_CHAT_URL=https://ask-k.ask-k-worker.workers.dev` to see
the chat. `npm run build` crashes on this Mac's Node (SIGSEGV) at times; GitHub's build is the check.

**Owner style:** asks in short messages with screenshots; wants things tried in the browser and
shown; likes arcade/retro touches; replies in the "Easy Read" output style.

## Home page structure (current)

How to read this file: the newest decisions come first in each section; "was tried / rejected"
notes are history, not instructions. Big-picture map: `src/content/*` (data) → `src/app/*`
(routes) → `src/components/*` (each big page is one WebGL-heavy component) → `src/lib/*`
(shared canvas/geometry helpers, hand-off state in `scatter.ts`, `snapshot.ts`, `cardGrid.ts`).

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
- Showcase menu (owner's request; the corner About/Contact links were too faint): "MENU" in place
  of "Selected work" (`.sc__menu`), items About, Contact us (`/about/#contact`: AboutStory's
  `tvOn` scrolls to `#contact`), Resume ↗ (site.resume), arcade style (hovered item red with a
  blinking ▶); phones: a row under the top bar. The project page's `.sc--ghost` copy matches.
  Hovering a menu item plays `music.blip()` (a synthesized arcade cursor bip-bip; sound on only).
  The hint under the menu is just "Click to open · scroll to change" on one line, on a paper chip
  (it reaches over the cabinet).
  Wheel: ONE card per swipe, but easy on a trackpad: a 20 px push steps; then locked until the
  events pause 140 ms OR a clearly new push arrives (an event > 2.5× the last few's average,
  only after the swipe has faded below 40% of its peak and ≥250 ms after the step; the recent
  list resets on a pause). Steps ≥300 ms apart. Tested with simulated swipes: one long swipe =
  1, a new swipe inside the old momentum = 1 more, a gentle push = 1. (Looser detectors moved
  two cards: they counted a swipe's own ramp-up or the momentum's bumps as a new swipe.)
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
  page (on the project page the travelling screen swaps the arcade picture for the project
  picture with a slice GLITCH, not a fade: `u_cardMix` in SCR_FS); the hand-off outline is the arcade screen's (UV grid → project → `lensInv`), so the
  room grows from behind it. Project page opening: first exactly the home screen's shape in
  perspective (`u_hinv` = inverse homography of the outline's 4 corners, `u_qs`; kept near
  the screen's box because perspective runs away), then a rounded box (`u_scale`, growing
  as grow^2.4) takes over and always ends covering the whole view (`cover`). The old unused showcases (`ComputerShowcase`, `BmoScreen`, `BendShowcase`,
  `cardFace`) and their assets (bmo.glb, computer.glb, card-mark/paper.webp) were deleted (they
  were published though unused; BMO is Adventure Time's); they are in git history.
- Landing background (landing only, ps < 0.45; the showcase has its own cards): 22 cards with
  90s arcade games (`src/content/arcadeGames.ts`: titles, years, genres) float behind everything.
  Covers: the real flyers/covers (owner's request; from each game's Wikipedia infobox, 400 wide
  WebP in `public/landing/covers/`, `artOnly`: nothing printed over them); a game without one
  falls back to our painted genre scene (`src/lib/gameArt.ts`, title printed logo-style) (`floaters`, own scene `bscene` + `rtB`,
  composited in POST over the paper, under the ink and the arcade). They drift up and sway,
  wrap round, and slip away from the mouse (spring back; touch screens: a finger pushes them and
  two unseen `pushers` wander across the screen so they keep dodging). Labels via `drawCardLabel` with a
  `CardText` (`projectCard(p)` for the project cards; `bigMax` lets short titles print big).
- Music (`src/lib/music.ts` + `Music.tsx` in the root layout, so it carries across client page
  changes; Web Audio, gapless loops, crossfades; files in `public/audio/`, Street Fighter II
  tracks). The site ALWAYS STARTS SILENT (owner's choice; nothing remembered). The "SOUND
  ON/OFF" button (bottom centre, `.sound`) is the only way in: on → "Game Start" (the coin),
  then the page's loop: home "Stage Select", about "Credits Roll", project pages "Continue";
  off → stops. Opening a project (`music.openProject()`): music glitches out, "Round" plays,
  "Continue" waits for it (`holdUntil`). Every track change plays a short synthesized glitch
  (`glitchBuffer`, no file) and the old track slows like a tape stopping. Card wheel steps play
  `music.tick()` (a synthesized ratchet) on top; each project card landing on the showcase plays
  `music.thud()` (a synthesized low thud + click). (A "PRESS START" gate was tried and removed.)
- First-load counter (`Loader.tsx` in the root layout, server-rendered so it covers the first
  paint; `src/lib/loading.ts`): counts 1 → 100 from real progress, climbing from the bottom-right
  corner to the top-right (`--k`), then glitches away (`loader-out`) with the page ready behind.
  Pages register their heavy work at the START of their effect (before anything async, or the
  counter can finish early): home = arcade.glb + card.glb (byte progress via `bytes()`), covers,
  first frame; about = TV model + photo; project pages = their `scene3d`; plus fonts + window
  load. Min 1.4 s, gives up at 20 s; scroll/keys are held meanwhile. Only the first load.
- Performance: the floating cards' labels are 512² (`BG_TEX`; 2048² × 30 was ~500 MB of GPU
  memory). Intent prefetch (`src/lib/prefetch.ts`, low priority, not on data-saver/slow): the
  active project's `scene3d` after resting 0.7 s on its card; About's models on hovering
  "About" in the menu. Each page still loads its own 3D on arrival.
- K logo on the showcase: `glitchJump` (tv.ts) glitches out, jumps to the top, glitches in; the
  scroll-eased canvases snap meanwhile (`snap.until` in stage.ts: InkHero `shown`, Arcade `ps`)
  so nothing plays backwards.
- "Ask K" AI assistant (AskK.tsx in the root layout; backend `worker/`, a Cloudflare Worker,
  free tier; setup in README → "Ask K assistant"). Runs on Cloudflare Workers AI (free Llama 3.1
  8B, `MODEL` in worker/src/index.ts; owner wants ZERO cost and no Claude/Anthropic account; the
  free plan stops at its daily allowance, it never bills). It was first built on Claude Haiku via
  the Anthropic API (separate pay-per-use billing, nothing to do with a Claude plan) and replaced.
  Streamed as plain text; the profile (`worker/src/knowledge.md`, generated by `npm run knowledge`
  from site.ts / about.ts / projects.ts / stack.ts + `src/content/assistant-facts.md`, TODO lines
  skipped) is in the system prompt; a small model needs plain firm rules, keep them numbered and
  short. Speaks as K's assistant, third person; "I don't know, email him" over guessing; a DO NOT
  SHARE list (the owner's phone is deliberately NOT in any file). Spam ceiling: Workers rate limit
  8/min/IP, KV daily cap (DAILY_CAP 400, ~12 neurons per message vs the 10,000/day free
  allowance), Turnstile bot check → signed 30-min pass (`x-ask-k-pass`), CORS to the site only,
  600 chars / 10 turns. Page-aware: AskK sends `page: { kind, project? }` (`whereNow`: project
  page → its name; home showcase → the card in front, from `html[data-sc-active]` set by
  ArcadeShowcase; about; home) and the Worker adds one checked "CURRENT PAGE" line (`pageLine`:
  known kinds only, name must match a short plain pattern) so "this project" works. Mascot: BMO ("BMO" by linus1178, CC BY 4.0, `public/ui/bmo.glb`,
  108 KB; credited) is the button (`Bmo.tsx`; no "ASK K" label any more, owner): floats bottom-left,
  leans to the pointer; its face is repainted into the model's own texture (face box FACE, stored
  flipped vertically): blinks, "..." while thinking, chatters while the answer streams, and an
  EMOTION picked in AskK from the question (`feelQuestion`: private → secret wink + zipped mouth,
  compliments → love hearts, greetings → excited, rude → sad with a tear, "really?" → surprised)
  then from the answer (`feelAnswer`: errors → sad, "I don't know"/off-topic → confused "?",
  else excited/happy), held ~5 s; dozes off (sleepy, z's) after a minute alone and wakes up
  surprised; body language too (bounce, droop, tilt). says "Hi! Ask me about K" once per visit. BMO is Adventure
  Time's character (IP): on the before-award list. (A "Sad toaster" mascot was CC BY-NC: skipped.)
  Footer is ONE line "AI · can make mistakes · Privacy"; "Privacy" links straight to Cloudflare's
  privacy policy (they run the model; owner's choice, no in-chat notice).
  CRT window, chips,
  sessionStorage only. Hidden unless `NEXT_PUBLIC_CHAT_URL` is set (GitHub Actions repo
  variable). `worker/` is excluded from the site's tsconfig/eslint (it has its own).
- Hand mode (`HandMode.tsx` + `src/lib/hand.ts`; owner saw adriangnzl.es): a "✋ HAND MODE" chip
  bottom-right (hidden on touch-only devices) turns on the webcam; MediaPipe Tasks Vision
  HandLandmarker runs in the browser (npm `@mediapipe/tasks-vision`, Apache-2.0, credited; wasm +
  8 MB model self-hosted in `public/mediapipe/`, fetched only after the click; video never leaves
  the device). Gestures → events the site already handles: point = `pointermove` (+ pointerover/
  out for hover), ✌ peace sign (index + middle up, ring + little folded, held PEACE_MS 150) = one
  click where the sign started (owner: not a quick pinch); pinch (thumb+index, 0.30 on / 0.45 off
  of hand size) = the left button held down (drag, pointerup on release, never a click; dot red),
  fist up/down = synthetic `wheel`; on the pinned home showcase (`html[data-sc-pinned]`) the fist
  is a joystick instead (`fist()` in hand.ts: offset of the middle knuckle from where the fist
  settled; past FIST_STEP = ArrowDown/Up, repeats every FIST_REPEAT while held; back to the middle
  re-arms; no page scroll there). The cursor moves ONLY while pointing ☝ or pinching 🤏 (owner);
  the open-hand flick (arrow keys) was removed; palm hold on About clicks its "Selected work"
  link (back to the showcase). Showcase pin (all input, owner): once the showcase is reached,
  any scroll up snaps back to it; only the K logo (unpins first) goes back to the landing.
  Old fist-on-showcase problem: returning the fist stepped back / scrolled to the landing.
  open-hand flick = ArrowLeft/Right keydown (cards / picture slider / viewer), open palm held 0.8 s =
  click `.askk__close` / `.pd__viewer-close` / `.pd__close`. Esc or the chip turns it off and stops
  the camera; H toggles it (not while typing). The mouse keeps working alongside it: `Cursor.tsx`
  ignores untrusted (synthetic) pointer events, so its ring follows only the real mouse. Thresholds came from the test page (`public/hand-test/`, git-ignored, temporary) and
  need tuning on the owner's real hand. CSS :hover doesn't fire from synthetic events.
- `<html>`/`<body>` have `suppressHydrationWarning`: extensions like Grammarly add attributes.
- Colours (owner removed the light/dark switch and its arcade button; they are in git history):
  the HOME page (landing + showcase) is LIGHT paper; About, project pages, the loader and the
  Ask K window are dark.
  Landing cards: 30, mixed sizes (`SIZES` per card; bigger ones react to the pointer from further).
- Smooth scrolling site-wide (`SmoothScroll.tsx` in the root layout): wheel → target, the
  page eases to it (CATCH, WHEEL). Skips wheels a page already took (`defaultPrevented`: the
  home card wheel), inner scroll boxes, pinch, sideways, touch, reduced motion; stops when
  something else moves the page (keys, scrollbar, scrollTo).
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
  Maintain), each with an icon drawn in `drawIcon`. The page has ONE TV (`AboutTv.tsx`,
  three.js on a fixed canvas behind the text; loader `src/lib/tvModel.ts`; shared state
  `src/lib/aboutTv.ts`). It scrolls in with "What I do" and waits on the right (phones: lower
  middle; smaller since the owner asked); no fade. It writes its screen's 4 projected corners
  to `aboutTv.px` each frame and the particle shader maps the icon spots (screen uv,
  `iconPoints`) onto them (`u_q`, `onScreen`; no page curve for them so they sit on the 3D
  screen), so from (01) the photo's particles fly into the TV screen. Only ICON_KEEP of the
  particles stay for the icons (small screen); they fade when the screen turns away (`u_face`,
  from the corners' winding) so they never show through the TV's back. After Maintain the TV
  tips over and falls WITH the scroll the whole way to Contact (owner: not drop first and
  wait): tumbling (scroll + a time-based `tumble`), swinging side to side right of the
  timeline line, darker (lights down, never see-through), behind the Experience years; over
  the last ~0.85 screen before `landAt` it falls into `.ab__contact-tv`, then squashes,
  bounces and rattles, and the section jolts (`.ab__contact[data-thud]`). Poses blend with
  quaternion slerp (shortest way), so scrolling back up never unwinds extra turns.
  While it falls it glitches into other models (`SHELLS` / `SWAP_AT` in AboutTv, loaded by
  `loadShell` in tvModel.ts ~1.2 s after start): main TV → "Television" (defiat11, `scale` 1.3) →
  "Old TV - Vintage Style" (Elliot_Lisenkov; faces -x, `rotY` π/2) → "TV Retro White" (Lukas
  Bobor; its FRONT is -z, `rotY` π: the dark bulge with vents on +z is the tube's back; `scale`
  1.45: its antennas made the fit small; its glass is rounded, so the picture follows the glass's
  own outline, `outline` rows measured once with `measureGlass` in tvModel.ts: dev only, ~5 s). One-mesh models give their glass as a box
  [left, top, right, bottom] seen from the front (measured with a ray depth grid); check a new
  model from all four sides before trusting +z. (An "Old Retro Television" and a PS1 were tried
  and replaced.), all Sketchfab CC BY 4.0,
  credited in `contact.credits` (keep them). The last one lands in Contact, then BACK_S later
  glitches back into the main TV. The swap glitch (GLITCH_S) is a colour glitch: R/G/B drawn
  apart with raw `colorMask` passes + torn scissored bands + a random CSS hue-rotate, the two
  models flickering. Their screens: a grid laid over the glass by raycasting from the front
  (named mesh `skrin`, or the measured box), showing the same canvas (`tex2`).
  While falling the screen switches at random between SMPTE colour bars (`drawBars`, vertical
  hold slips) and "NO SIGNAL" static; the bars also show during each swap glitch. Icons: (magnifier, browser wireframe, 3-tier
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
  Copy emphasis (owner): modern frameworks first (React, Next.js, TypeScript, Node), WordPress /
  Elementor / Shopify second; don't dwell on the current job in the intro. The name line holds
  "Kaung Myat Soe," (no "I'm", owner) 5 s and flashes "Aka K," 2 s.
  Tech stack — just the logo ROW, no label/title/text (owner); `.ab__stack` (StackCarousel.tsx, own WebGL2 canvas, NOT the portrait's
  particles): 23 logos from Simple Icons (CC0; `src/content/stack.ts`, the 24×24 path `d`; the
  `main` ones first and yellow: React, Next.js, TypeScript, Node.js; WordPress & co. after), dense
  particles (step 1.25, LOGO 116); the NAMES are sharp text on a 2D canvas on top (`.ab__stack-names`,
  same wrap maths) because particle text was unreadable. Sampled into fixed
  particles on a row that loops sideways (SLOT/SPEED), slows under the pointer, can be dragged;
  they gather when the strip comes into view and nudge away from the pointer. Scrollable: a
  sideways trackpad swipe (or Shift + wheel) runs the row; vertical wheels still scroll the page. The portrait
  particles fade out over this section (`stackHide`) and fly to the year only as it leaves
  (`toYear` starts at its bottom); the falling TV shrinks/dims up into the top-right over it.
  Copy in `stackIntro` (about.ts).
  (03) Experience — headline short and fun ("Since 2023: four levels cleared. Still leveling
  up."); career, not projects (owner): 2023 diploma (SIM), 2025 degree (UOW),
  2025 freelance (10 months), 2026 web developer at a Singapore marketing agency (WordPress,
  Elementor, Shopify, custom plugins; now). Copy is friendly/energetic (owner is 22).
  Sticky big year in particles on the left that swirls and re-forms
  when the timeline entry nearest the screen middle changes year; timeline on the right.
  A fixed `CrtBackground` canvas draws a curved TV grid (same curve as the landing). All
  canvases share a `crt()` shader (curve + the landing's exact glitch: `GLITCH`/`glitchX` =
  per-line wobble, tear bands and the ~14 s rolling tracking band with a glow in the grid;
  one shared clock `u_clk` = `clk()` so every canvas glitches on the same lines; the old
  straight CSS band was removed), measured on the viewport via
  `u_rect`) and a shared eased pointer `turn`: the view and the text (--mx/--my, same
  transform as the project page HUD) move against the pointer; the DOM gets scanlines, a rolling band, vignette and occasional text jumps.
  (04) After hours (channel guide + particle hobby objects) was removed at the owner's request;
  `afterHours` is still in about.ts but unused.
  (05) Contact — `Contact` + `contact` in about.ts. Form (name, email, message) beside the
  TV that fell from "What I do" (`AboutTv`; `.ab__contact-tv .ab__tv3d` is only its spot and
  drag area; `public/about/tv.glb`).
  The TV's screen mesh (`Plane*`) gets a canvas texture fitted to its UV box: static +
  "NO SIGNAL" until you type, then "FROM:" + your message, teletext style; SENDING / THANK
  YOU on submit (Contact writes `aboutTv.screen`). The site is static, so submit opens a prefilled `mailto:` (no backend).
  After the last year (`yr2`, w[8]): the particles first HOLD the year, scrolling up with the page
  like the real one (`u_y2y`), from `unstickY` to +0.2 screen; only then flow to the form with a
  gentler swirl (×0.55). Going back up: form glitches to particles → they flow into the year →
  the year canvas takes over (it used to swirl into a blob right where the year let go).
  Then they draw the form (`fm`, w[10],
  attribute 11; w[9] is unused since After hours went): `buildForm` paints the title, label text, field
  underlines and the button (text cut out) at their spot for scroll `formY` (desktop: the
  section top; phones: form top − 14vh, capped at the page bottom), in the stage canvas's
  own units, and `u_fmy` moves them with the scroll. Near `formY` the swap is a GLITCH, not a
  fade (owner's request): the stage sets `.ab__form[data-live]` (hidden when off, `gx-text-in`
  when on) and the particles flicker out over ~0.36 s with slices jumping (`u_glitch`);
  reversed when scrolling back. Autofilled fields are kept dark (-webkit-autofill).
  Under the form one row (`.ab__contact-foot`): the CREDITS dropdown left, "↔ Drag to tilt" right,
  same line; opening the credits glitches in (`gx-text-in`) with a blip.
  The TV can be dragged to tilt only a little (MAX_YAW / MAX_PITCH in AboutTv, never its
  back; owner's request), with a short throw; ~2.5 s after release it turns back to face you.
  "↔ Drag to tilt" hint under it.
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

## Phones and tablets (2026-11-26 pass)

- Portrait tablets (≤1100px, portrait) use the PHONE layouts: home showcase framing
  (`phone` in ArcadeShowcase), About (01) stacked, "What I do" text on top, Contact stacked
  (and `formY` in AboutStory). CSS: `@media (max-width: 760px), (max-width: 1100px) and (orientation: portrait)`.
- Project page: ≤1200px three columns + thumbnails on their own centred row, "Next project" under
  the top bar; portrait tablets two columns; phones compact one column, no thumbnails (swipe).
- About header has a dark fade (`.ab__top::before`) so text never runs into the logo; the
  timeline text has a dark text-shadow (white TV model behind it).
- Hand mode: desktop only (≥1025px, fine pointer, no coarse pointer, maxTouchPoints < 2).
- Checked with Playwright screenshots at 390×844, 820×1180, 1180×820: no sideways overflow.
- Second pass (owner's iPhone/iPad simulator shots), checked in Playwright WebKit (iPhone 15, iPhone SE,
  iPad Pro 11 both ways): home sizes use `lvh` (Safari's full height; svh left a strip above the
  showcase when the toolbar hid); phone showcase framing lowered (fy 0.45, screen 50% wide) so the
  menu row clears the marquee. About portrait canvas is ALWAYS full screen (a 70svh canvas cut the
  particles flat and misplaced the year/TV targets); the figure is placed inside it (`phoneFig`:
  phones stand it on y = -0.4, tablets/desktop on the bottom edge); year targets use the canvas rect.
  Contact: phones/portrait tablets/short screens get a compact form so the TV + whole form fit the
  last screen (short phones tighter still); Credits stays above BMO. Project page on phones: the
  middle screen fits the measured free band between "Next project" and the text (`band` in
  ProjectDetail, re-measured every 0.6 s); tablets: info padded clear of BMO.
- Third pass: phones/tablets (narrow, `!wide` in AboutTv): the "What I do" TV fits the measured band
  between the step text and the tabs; it LEAVES while falling through Experience (no room beside the
  text) and comes back for the landing in Contact. Phones: the sticky year is a faint watermark
  (opacity 0.4, behind the timeline, no black block, `yearDim` dims the stage particles to match).
  Phones/tablets render the showcase at ≤1.5× pixel ratio. `allowedDevOrigins` in next.config lets a
  phone on the same Wi-Fi open the dev server (http://<Mac IP>:3000) for real-device tests.
- Real-iPhone fixes (owner: no ink flood on a real iPhone, fine in the simulator): touch devices
  (`lightInk()` in stage.ts: coarse pointer or maxTouchPoints > 1) skip InkHero's fluid sim entirely;
  ArcadeShowcase's POST shader draws the same flood/drain shapes itself (`anaInk`, uAna/uP/uQ/uOrigin;
  the desktop path copies the ink canvas into a texture every frame, which real iOS Safari does
  badly). Card wheel on touch follows the finger (`touch` in ArcadeShowcase: STEP_PX per card,
  release snaps with a flick carry of up to 2, swipe speed spins the cards; touches no longer start
  the single-card spin drag). (A `DevReport` helper that sent errors/FPS from a phone to the Mac was removed at publishing;
  it is in git history.)
- Real-iPhone log (iOS 27, 440×756 @3x): no JS errors; home 42–52 fps, projects ~60, About froze
  8.3 s on first showing the TV (shader compile on iOS). Fixes: AboutTv `renderer.compileAsync`
  before the loader lets go; touch devices skip the three fall SHELLS (TV hides during the fall
  there anyway; lands as the main TV); phones sample the portrait 320 wide (~half the particles).
  Touch devices: showcase cards always face front (no spin/tilt, they only slide). Galleries now
  start with the `preview.mp4` clips (after the cover); gallery videos are appended to the page
  invisibly and started muted (iOS only loads/plays videos that are in the page).
- Phones/tablets pass 5: tech stack row scaled (`sizeK` in StackCarousel: phones 0.55, tablets / touch
  0.72; shorter row). Project opening waits for its pictures AND the 3D room (max 4.5 s, never
  forever; `decoded()` falls back from img.decode() to onload, iOS can reject decode for the big
  in-memory home still: that used to leave the page stuck on the zoomed home screen). HomeTv jumps
  to the bottom again at 300/700 ms (the router's #work jump landed short on phones, unpinned).
  The phone test build needs NEXT_PUBLIC_CHAT_URL for BMO to show (the Worker only allows
  localhost:3000 and the live site, so chat replies fail from a LAN address).
- Pass 6: About on touch: no pointer interaction (portrait lens/smear, year smear, turn, stack nudge;
  `touchUI()`); canvases measure against `stableH()` (Safari's full height: the toolbar hiding on
  the first scroll shifted every particle up and back); resize only rebuilds year/form when the
  width or the height really changes. Phones/portrait tablets: tighter section gaps (stack, exp,
  timeline items, contact min-height 0).
- Chat security (Worker): `screen()` answers rule-changing attempts / off-topic jobs (only as
  requests to the bot, so questions ABOUT K pass) / junk / repeats WITHOUT calling the model;
  two such answers in a conversation → it stops (PAUSED); IP_DAILY 30 messages per hashed IP a day
  (KV, 2-day TTL); max_tokens 220. Site: 2.5 s between messages, 20 per visit. Turnstile is still
  optional (needs the owner to create a widget in the Cloudflare dashboard).
- Phone/tablet section gaps: the rules are prefixed `.ab ` (the base rules come LATER in globals.css
  and won), `.ab__stack` pulls up into the tabs' empty BMO room (-170px / phones -88px), fixed row
  heights (150 / 118px), last timeline item has no min-height.

- Pass 7 (owner's iPhone test in Chrome, Safari and the Google app, 2026-11-27): Chrome on iPhone
  keeps its toolbars on screen, so the `100lvh` showcase (pinned at the page bottom) lost its top
  (logo, menu): `.sc` and `.ink-stage` are now `100dvh` (the scroll length stays in lvh). The
  Google app reloaded the page on a project page (out of memory): every WebGL canvas now frees its
  context when it leaves the page (`releaseGl` in src/lib/releaseGl.ts: waits, skips canvases still
  in the page, so React's dev double-mount is safe); ProjectDetail's `fit()` leaked a full-screen
  texture + framebuffer on every resize (mobile toolbars resize often) and now frees the old one
  and skips same-size resizes; touch devices draw the project room at 0.35 (was 0.5) and the page
  at ≤1.5× pixel ratio.
  Then Safari glitched while scrolling the landing (its toolbar hides mid-scroll, so dvh changed
  and the stage resized): SAFARI ONLY is back to the old version (owner): an inline script in the
  layout's <head> sets `html[data-ios-safari]` (iPhone/iPad Safari, not CriOS / GSA / FxiOS /
  EdgiOS; `iosSafari()` in stage.ts is the same test) → `.ink-stage` / `.sc` 100lvh, and the
  project page keeps 0.5 room resolution and 2× pixel ratio there. The memory fixes stay for all.
  (Playwright WebKit reports maxTouchPoints 0: fake 5 with addInitScript to test it.)

- About on phones and tablets is a STILL page (owner, 2026-11-27: the animated one glitched
  there): `AboutSwitch` (src/app/about/page.tsx) renders `AboutStatic` on touch (`lightInk`) and
  `AboutStory` on desktop. AboutStatic = the same content with no WebGL / TV / scroll or glitch
  animation: the real photo, six skill cards (icons drawn once with AboutStory's exported
  `drawIcon`), the tech logos as an SVG grid, a plain timeline, the form (mailto) + Credits.
  Styles `.abs*` at the end of globals.css. The static HTML holds the still version; desktop
  swaps to the animated one after hydration (the loader covers it). So everything above about
  About's particles / TV on phones and tablets now applies to desktop only.

- Contact form email (owner chose Gmail SMTP, 2026-11-28): both forms (AboutStory `Contact`,
  AboutStatic `StaticContact`) POST to the Worker's `/contact` (`src/lib/contact.ts`); the Worker
  sends through smtp.gmail.com:465 with `worker-mailer` (npm, exact 1.3.1) from and to SMTP_USER,
  Reply-To = the visitor. Secrets SMTP_USER / SMTP_PASS (a Gmail APP password; the owner types it
  with `npx wrangler secret put`, never in chat or a file). Guards: the chat's rate limiter, 5 a
  day per hashed IP, 60 a day site-wide (KV), a hidden `website` bot-trap field, control
  characters stripped (no header injection), max 3 links. Not set up / send failed / offline →
  the form falls back to opening the visitor's mail app (the old mailto).
  reCAPTCHA v3 (owner): invisible, loaded on the form's first focus (`loadRecaptcha` in
  src/lib/contact.ts), token sent as `recaptcha`, the Worker checks it (score ≥ 0.5, action
  "contact") ONLY when the secret RECAPTCHA_SECRET is set; the site key is the repo variable
  NEXT_PUBLIC_RECAPTCHA_SITEKEY (deploy.yml). The badge is hidden (`.grecaptcha-badge`) and the
  required "protected by reCAPTCHA" line shows under the form instead (only when a key is set).

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
- 3D background (`scene3d` in projects.ts, KotobaLab: "Japanese street at night" by AFX/CGMotion,
  CC BY 4.0, credit shown under Info as `.pd__credit`, keep it): three.js renders it on its own
  canvas at half resolution each frame and that canvas is uploaded as the BG pass's picture
  (`u_mono` 0.2: mostly colour); the pointer turns the camera (`u_turn` 0 for it). The .glb was
  73 MB, nearly all textures: `scripts/shrink-glb.cjs` (sharp) → 512px WebP = 6.4 MB.
  All five have one, all CC BY 4.0 (checked on Sketchfab's API before the award submission;
  every credit says "modified", as CC BY asks): KotobaLab street; ShopShop "7 eleven" (Pasha-,
  3.3 MB, NOT merged: its tiled floor uses a second UV set that `--merge` drops; ~cm units);
  Myanglish "office is old abandoned FREE" (dasy444, `--merge`, 5.1 MB); PeakFit "Training Gym"
  (local.yany, 2.6M triangles → `--ratio 0.04`, 8.7 MB; has a skin so it can't merge); EmoFace
  "matrix 2005 scena" (neosearch, 0.1 MB, metal materials → `env` 0.8 RoomEnvironment).
  Replaced for licences: "Late Night Office" (CC BY-NC) and "Super market for free" (Sketchfab
  Standard, not CC). Don't use NC / Standard / unlisted licences here.
  (An "Arcade Room" was tried for ShopShop and replaced.) Per-scene `fov` (the page lens
  magnifies the middle: wider shows more), `fog` (density in the model's units), `env`,
  `exposure`; sway scales with the eye–look distance. A model's bbox can include a tall sign or
  antenna: pick the eye height by looking, not by bbox fractions.
  `scripts/shrink-glb.cjs`: `--tex` (WebP size), `--merge` (one piece per material, transforms
  baked: fixes thousands of meshes/draw calls), `--ratio/--error/--min-tris` (meshoptimizer
  simplify; after a merge keep `--error` small, it is relative to the whole merged mesh, or
  small objects vanish), `--drop-tangents`.
- "NEXT PROJECT ▸ / <name>" (`.pd__next`, bottom right above the Hand mode chip; phones: under
  the top bar; loops) = TvLink glitch switch to the
  next project; ProjectDetail calls `tvOn` in a layout effect and the route page keys it by slug.
  About `.ab__contact-foot` bottom padding max(16svh, 220px) keeps CREDITS above the fixed BMO.
- Project `context` (yellow tag under the name: who / why, e.g. "Solo · personal tool") and
  `story` (why it exists, owner's own reasons, sentence case under the summary) in projects.ts.
  Work numbers (owner, 2026-11): 50+ info/e-commerce sites, custom plugins on 50+ client sites,
  AI automation for internal workflows: company work, can't be shown or named.
- HUD (owner: was hard to read over the dark rooms): dark gradient bands top and bottom
  (`.pd::before/::after`), yellow labels, text shadow. "Role" became "Built with" (the `stack`
  list; `role` in projects.ts is no longer shown). The 3D background's credit moved off the
  page to `/credits` (src/app/credits: every model, the music, the covers, the fonts; CC BY
  needs it somewhere). Now ALL credits (every model, music, covers, logos, fonts) are ONE small
  `<details>` dropdown ("CREDITS ▸") at the very bottom of the About page (`Credits.tsx`,
  `#credits`; owner: there, but never in the spotlight); the /credits route, the home
  `.sc__credit` line, the About contact credit line and the project "Credits" link were removed
  (they overlapped the SOUND button). Keep the section: CC BY requires it.
- Viewer: a click on the middle screen (not a drag) opens the picture whole and uncropped
  (`.pd__viewer`; arrows/‹ › step, Esc or a click outside closes, Esc no longer leaves the page
  while it's open).
- Videos in `gallery` (.mp4/.webm/.mov): drawn into their screen every frame while playing;
  the one in front plays (muted, looping), the others pause and rewind; thumbnails are
  <video>. PeakFit's g1/g3 are still frames from Rotato phone-mockup videos: drop the real
  videos in public/projects/peakfit/ and list them in `gallery` to make them play.
- KotobaLab background photos (`room-photo.webp`, `shrine-photo.webp`) are git-ignored
  until the owner confirms they're licensed.

## What's intentionally not here

- (Superseded: `/about` now exists, see "About page" above.)
- Before an award submission (owner's plan, not yet): the real game covers on the landing
  cards, the Street Fighter art on the arcade cabinet, the BMO chat mascot and the Street Fighter II music are
  Capcom's / the publishers' IP; swap them then (painted covers: drop `cover` in
  arcadeGames.ts; a different cabinet model; royalty-free chiptune in `public/audio/`).
- PeakFit has no live/code link (the old site had none either). Don't invent one.

## Commands

There is no test runner. Verify with `npm run lint`, `npx tsc --noEmit`, and by looking at
the page in a browser (most of the work is WebGL, so visual checks matter).

```bash
npm run dev     # http://localhost:3000
npm run build   # static site in ./out
npm run lint
```

A `next build` that dies with "SIGSEGV" is the CSS optimizer crashing on a CSS value: it
happened on `calc(... + 3 * (clamp(...) + 12px) ...)` in globals.css; write such values out
(`clamp(3rem, 4.05vw, 3.9rem) + 66px`). To find one, build an older commit in a worktree and
swap files in.

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

- Tune and publish Hand mode and the BMO chat changes (see "Current state").
- Optional: Cloudflare Turnstile for the chat (README → "Ask K assistant"); shrink
  `public/about/tv-television.glb` (5.3 → ~2 MB with `scripts/shrink-glb.cjs`).
- PeakFit gallery "videos" are still images: needs the real .mp4 files from the owner.
- Before any award submission: swap the third-party IP (see "What's intentionally not here").
- Point `kfolio.online` at the Pages site.
- Review the written copy in `site.ts` and each project's `summary` (drafted, not confirmed).
