/**
 * The site's music (Street Fighter II tracks, Capcom's: see CLAUDE.md before an award
 * submission). One player for the whole visit, kept in the root layout by `Music.tsx`, so
 * tracks carry across page changes. The site always starts silent; the SOUND button turns it on:
 *   on       → "Game Start" (the coin), then the page's loop:
 *   home     → "Stage Select" on a loop (after "Game Start" has finished)
 *   about    → "Credits Roll" on a loop
 *   project  → "Continue" on a loop
 *   opening a project → "Round" (a one-off sound on top)
 * Between two tracks a short glitch plays (made here, no file) and the old track slows down
 * like a tape stopping. Web Audio: gapless loops, crossfades. Browsers only allow sound after
 * a click, tap or key, which is why there is a start gate; the sound button turns it off/on
 * (remembered in localStorage).
 */
export type Scene = "home" | "about" | "project" | null;

const SRC = {
  start: "/audio/game-start.mp3",
  stage: "/audio/stage-select.mp3",
  credits: "/audio/credits-roll.mp3",
  round: "/audio/round.mp3",
  cont: "/audio/continue.mp3",
} as const;
type Track = keyof typeof SRC;

const MUSIC_VOL = 0.32, SFX_VOL = 0.55, GLITCH_VOL = 0.2, FADE_S = 0.6;

type Playing = { track: Track; node: AudioBufferSourceNode; gain: GainNode };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<Track, Promise<AudioBuffer>>();
let playing: Playing | null = null;
let scene: Scene = null;
let unlocked = false;
let holdUntil = 0;                       // the next loop waits for a one-off ("Game Start", "Round")
let holdTimer = 0;
let glitchBuf: AudioBuffer | null = null;
let tickBuf: AudioBuffer | null = null;
const listeners = new Set<() => void>();

let on = false;                          // always starts silent (owner's choice)

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = on ? 1 : 0;
    master.connect(ctx.destination);
  }
  return ctx;
}

function load(t: Track) {
  if (!buffers.has(t)) {
    const c = audio();
    buffers.set(t, fetch(SRC[t]).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)));
  }
  return buffers.get(t)!;
}

/** A short digital glitch: static that stutters at changing sample rates, with a buzz. */
function glitchBuffer(c: AudioContext) {
  if (glitchBuf) return glitchBuf;
  const dur = 0.42, sr = c.sampleRate, n = Math.floor(dur * sr);
  const b = c.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let i = 0, seed = ch * 7 + 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (i < n) {
      const len = Math.floor(sr * (0.012 + rnd() * 0.035));       // 12–47 ms slices
      const mode = rnd(), hold = 1 + Math.floor(rnd() * 40);       // sample-and-hold: crunchy
      const amp = mode < 0.18 ? 0 : 0.35 + rnd() * 0.65;            // some gaps
      const buzz = 60 + rnd() * 900;
      let v = 0;
      for (let k = 0; k < len && i < n; k++, i++) {
        if (k % hold === 0) v = rnd() * 2 - 1;
        const sq = Math.sign(Math.sin((2 * Math.PI * buzz * i) / sr)) * 0.35;
        const env = Math.min(1, i / (sr * 0.01)) * Math.min(1, (n - i) / (sr * 0.06));
        d[i] = (mode > 0.7 ? sq : v) * amp * env;
      }
    }
  }
  return (glitchBuf = b);
}

/** A prize wheel's ratchet: five quick clicks, slowing down (made here, no file). */
function tickBuffer(c: AudioContext) {
  if (tickBuf) return tickBuf;
  const sr = c.sampleRate, n = Math.floor(0.3 * sr);
  const b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  [0, 0.04, 0.085, 0.14, 0.21].forEach((at, k) => {
    const s0 = Math.floor(at * sr), len = Math.floor(0.012 * sr), loud = 1 - k * 0.15;
    for (let i = 0; i < len && s0 + i < n; i++) {
      const env = Math.exp(-i / (sr * 0.0025));                            // a sharp click
      const blip = Math.sin((2 * Math.PI * (2600 - k * 120) * i) / sr);    // with a little ping
      d[s0 + i] += ((rnd() * 2 - 1) * 0.6 + blip * 0.5) * env * loud;
    }
  });
  return (tickBuf = b);
}

function playGlitch() {
  if (!ctx || !master || !on) return;
  const node = ctx.createBufferSource(), gain = ctx.createGain(), bp = ctx.createBiquadFilter();
  node.buffer = glitchBuffer(ctx);
  bp.type = "bandpass"; bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(2400, ctx.currentTime);
  bp.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.4);
  gain.gain.value = GLITCH_VOL;
  node.connect(bp).connect(gain).connect(master);
  node.start();
}

/** Fade the current loop out and stop it; `tape`: it also slows down, like a tape stopping. */
function stopMusic(fade = FADE_S, tape = false) {
  if (!playing || !ctx) return;
  const p = playing; playing = null;
  const now = ctx.currentTime;
  p.node.onended = null;
  p.gain.gain.cancelScheduledValues(now);
  p.gain.gain.setValueAtTime(p.gain.gain.value, now);
  p.gain.gain.linearRampToValueAtTime(0, now + fade);
  if (tape) p.node.playbackRate.linearRampToValueAtTime(0.45, now + fade);
  try { p.node.stop(now + fade + 0.05); } catch {}
}

/** Play `t` on a loop (the old one glitches out, the new one fades in). */
async function playLoop(t: Track) {
  if (playing?.track === t) return;
  if (playing) { playGlitch(); stopMusic(FADE_S, true); }
  const buf = await load(t);
  if (playing?.track === t) return;
  const c = audio();
  if (!master) return;
  const node = c.createBufferSource();
  node.buffer = buf; node.loop = true;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(MUSIC_VOL, c.currentTime + FADE_S);
  node.connect(gain).connect(master);
  if (playing) stopMusic(0.2);
  playing = { track: t, node, gain };
  node.start();
}

/** A one-off sound on top (it doesn't replace the music). */
async function oneShot(t: Track, vol = SFX_VOL) {
  const buf = await load(t);
  const c = audio();
  if (!master) return 0;
  const node = c.createBufferSource(), gain = c.createGain();
  node.buffer = buf; gain.gain.value = vol;
  node.connect(gain).connect(master);
  node.start();
  return buf.duration;
}

const LOOP: Record<Exclude<Scene, null>, Track> = { home: "stage", about: "credits", project: "cont" };

/** What the current page should be playing (after any one-off that is still going). */
function sync() {
  if (!unlocked || !on) return;
  window.clearTimeout(holdTimer);
  const wait = holdUntil - performance.now();
  if (wait > 0) { holdTimer = window.setTimeout(sync, wait); return; }
  if (scene) void playLoop(LOOP[scene]);
  else stopMusic();
}

export const music = {
  /** The page changed (from the root layout). */
  setScene(s: Scene) {
    if (s === scene) return;
    scene = s;
    sync();
  },
  /** Sound on (a click, so the browser allows it): the coin drops, then the page's loop. */
  start() {
    unlocked = true;
    const c = audio();
    (Object.keys(SRC) as Track[]).forEach((t) => void load(t));   // fetch the rest meanwhile
    holdUntil = performance.now() + 2600;                           // until "Game Start" is done
    void c.resume().then(async () => {
      const d = await oneShot("start", MUSIC_VOL * 1.4);
      holdUntil = performance.now() + d * 1000 - 150;
      sync();
    });
  },
  isUnlocked: () => unlocked,
  /** Hovering a menu item: an arcade cursor "bip-bip" (two quick square notes, made here). */
  blip() {
    if (!unlocked || !on || !ctx || !master) return;
    const t = ctx.currentTime;
    [[988, 0], [1480, 0.045]].forEach(([f, at]) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = "square"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(0.07, t + at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.06);
      o.connect(g).connect(master!);
      o.start(t + at); o.stop(t + at + 0.07);
    });
  },
  /** The card wheel moved one step: a short ratchet on top of the music (never replaces it). */
  tick() {
    if (!unlocked || !on || !ctx || !master) return;
    const node = ctx.createBufferSource(), gain = ctx.createGain();
    node.buffer = tickBuffer(ctx);
    node.playbackRate.value = 0.92 + Math.random() * 0.16;                  // never quite the same
    gain.gain.value = 0.28;
    node.connect(gain).connect(master);
    node.start();
  },
  /** A card slams down (landing): a low thud with a short click, a little different each time. */
  thud() {
    if (!unlocked || !on || !ctx || !master) return;
    const t = ctx.currentTime, f = 1 + (Math.random() - 0.5) * 0.25;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(150 * f, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.22);
    const n = ctx.createBufferSource(), ng = ctx.createGain(), bp = ctx.createBiquadFilter();
    n.buffer = tickBuffer(ctx); bp.type = "bandpass"; bp.frequency.value = 1800;
    ng.gain.value = 0.12; n.connect(bp).connect(ng).connect(master); n.start(t);
  },
  /** Opening a project: the home music glitches out and "Round" plays. */
  openProject() {
    if (!unlocked || !on) return;
    holdUntil = performance.now() + 1500;                           // "Continue" after "Round"
    playGlitch();
    stopMusic(0.35, true);
    void oneShot("round");
  },
  isOn: () => on,
  toggle() {
    on = !on;
    if (master && ctx) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.08);
    if (on) music.start();                                          // every time: coin, then music
    else { window.clearTimeout(holdTimer); stopMusic(0.15); }
    listeners.forEach((f) => f());
  },
  subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; },
};
