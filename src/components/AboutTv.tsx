"use client";

import { useEffect, useRef } from "react";
import { skills } from "@/content/about";
import { loadShell, loadTv, type Shell } from "@/lib/tvModel";
import { lightInk } from "@/lib/stage";
import { aboutTv } from "@/lib/aboutTv";
import { bytes, loading } from "@/lib/loading";

const SCREEN_W = 512, SCREEN_H = 384;
/** How far a drag can turn it once it has landed (radians): a little, never its back. */
const MAX_YAW = 0.45, MAX_PITCH = 0.2;
/** What it glitches into while it falls, in order (all CC BY 4.0, credited in Contact). The
 *  last one lands in Contact, then glitches back into the main TV (BACK_S after landing). */
const SHELLS: Shell[] = [
  { url: "/about/tv-television.glb", screen: /skrin/, inset: 0.14, scale: 1.3 },
  // faces -x: turned to face front; one mesh, so its glass is given as a box (from the front)
  { url: "/about/tv-vintage.glb", rotY: Math.PI / 2, screen: [0.08, 0.11, 0.67, 0.88], inset: 0.06 },
  // its front is -z (the dark bulge with vents on +z is the back of the tube)
  // the picture follows its glass's rounded outline (measured once with measureGlass)
  {
    url: "/about/tv-retro-white.glb", rotY: Math.PI, screen: [0.11, 0.47, 0.64, 0.87], scale: 1.45,
    outline: [[0.098,0.1299,0.6547], [0.1212,0.1102,0.659], [0.1386,0.1013,0.664], [0.1618,0.0983,0.6709], [0.1792,0.0945,0.6709], [0.1966,0.0945,0.6709], [0.214,0.0945,0.6709], [0.2314,0.0945,0.6747], [0.2488,0.0945,0.6747], [0.272,0.0945,0.6747], [0.2894,0.0907,0.6747], [0.3068,0.0907,0.6747], [0.3242,0.0907,0.6747], [0.3416,0.0907,0.6747], [0.359,0.0907,0.6747], [0.3822,0.0907,0.6747], [0.3996,0.0907,0.6709], [0.417,0.0945,0.6709], [0.4344,0.0945,0.6709], [0.4518,0.1022,0.6709], [0.4692,0.1052,0.664], [0.4924,0.114,0.6513], [0.5272,0.1299,0.6393]],
  },
];
/** Where in the fall (0..1) each model takes over: main TV, Television, Old TV Vintage, TV Retro White. */
const SWAP_AT = [0, 0.2, 0.42, 0.64];
const GLITCH_S = 0.5, BACK_S = 0.9;
/** Camera distance (the TV is placed in px and scaled, so this only sets the perspective). */
const CAM_D = 7;

/** Word-wrap `text` to lines that fit `max` px. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const sm = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * The About page's one old TV (model credited in Contact), drawn on a fixed canvas behind
 * the text, the whole way down:
 * - "What I do": it scrolls in with the section and waits on the right (phones: lower
 *   middle); the portrait particles fly into its screen and draw each skill's icon there
 *   (it writes its screen corners to `aboutTv` every frame).
 * - After Maintain it tips over and falls with your scroll, tumbling and swinging side to
 *   side, darker, in the background behind the Experience years.
 * - As you arrive in Contact it falls into its spot beside the form, lands with a bounce,
 *   squash and shake, and becomes the contact TV: it shows what you type and can be dragged
 *   to tilt a little. All scroll-driven, so scrolling back up plays it backwards.
 */
export default function AboutTv({ turn }: { turn: { x: number; y: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current!;
    let stop = () => {}, alive = true;
    const ld = loading.add("about:tv", 3);                    // the first-load counter waits for it
    const go = window.setTimeout(() => void start().catch(() => ld(1)), 200);

    async function start() {
      const THREE = await import("three");
      if (!alive) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
      camera.position.set(0, 0, CAM_D);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-3, 4, 5); scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(4, 2, -4); scene.add(rim);

      const sc = document.createElement("canvas"); sc.width = SCREEN_W; sc.height = SCREEN_H;
      const g = sc.getContext("2d", { willReadFrequently: true })!;
      const tex = new THREE.CanvasTexture(sc);
      tex.colorSpace = THREE.SRGBColorSpace;
      const dot = getComputedStyle(document.body).getPropertyValue("--font-dot").trim() || "monospace";
      const mono = getComputedStyle(document.body).getPropertyValue("--font-mono").trim() || "monospace";

      const tv = await loadTv(THREE, tex, bytes(ld));
      if (!alive) { renderer.dispose(); return; }
      host.appendChild(renderer.domElement);
      const rig = new THREE.Group(); scene.add(rig);
      rig.add(tv.model);
      // prepare its shaders now, while the loading counter is up: compiling them on the first
      // frame it shows froze phones for seconds mid-scroll
      try { await renderer.compileAsync(scene, camera); } catch {}
      ld(1);
      if (!alive) { renderer.dispose(); return; }
      // the others it turns into while it falls (loaded a little later; it stays the main TV
      // until they are in). Their screens play the same picture through a second texture.
      const tex2 = new THREE.CanvasTexture(sc);
      tex2.colorSpace = THREE.SRGBColorSpace;
      const models: (import("three").Object3D | null)[] = [tv.model, ...SHELLS.map(() => null)];
      const scrMats: import("three").MeshBasicMaterial[] = [];
      // (phones / tablets: not at all. The TV leaves during the fall there, and three more
      // models to download, parse and compile cost a phone seconds)
      const later = lightInk() ? 0 : window.setTimeout(() => SHELLS.forEach((sh, i) => {
        loadShell(THREE, sh, tex2, tv.aspect).then((m) => {
          if (!alive) return;
          m.visible = false; rig.add(m); models[i + 1] = m;
          m.traverse((o) => { if (o.name === "screen") scrMats.push((o as import("three").Mesh).material as import("three").MeshBasicMaterial); });
        }).catch(() => {});
      }), 1200);

      let W = 1, H = 1, upp = 1;   // upp: world units per px at the TV's depth
      const fit = () => {
        W = host.clientWidth; H = host.clientHeight;
        renderer.setSize(W, H, false);
        camera.aspect = W / Math.max(1, H); camera.updateProjectionMatrix();
        upp = (2 * CAM_D * Math.tan((camera.fov * Math.PI) / 360)) / H;
      };
      fit();
      const ro = new ResizeObserver(fit); ro.observe(host);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

      // drag to tilt it a little once it has landed (with a short throw)
      const pad = document.querySelector<HTMLElement>(".ab__contact-tv .ab__tv3d");
      const spin = { yaw: 0, pitch: 0, vy: 0, vp: 0, drag: false, x: 0, y: 0, at: 0 };
      const lim = (v: number, m: number) => Math.max(-m, Math.min(m, v));
      // pulling further gets harder near the limit
      const pull = (v: number, d: number, m: number) => lim(v + d * (Math.sign(d) === Math.sign(v) ? Math.max(0, 1 - Math.abs(v) / m) : 1), m);
      const down = (e: PointerEvent) => { spin.drag = true; spin.x = e.clientX; spin.y = e.clientY; pad!.setPointerCapture(e.pointerId); pad!.dataset.drag = "on"; };
      const move = (e: PointerEvent) => {
        if (!spin.drag) return;
        spin.vy = (e.clientX - spin.x) * 0.006; spin.vp = (e.clientY - spin.y) * 0.004;
        spin.x = e.clientX; spin.y = e.clientY;
        spin.yaw = pull(spin.yaw, spin.vy, MAX_YAW); spin.pitch = pull(spin.pitch, spin.vp, MAX_PITCH);
      };
      const up = () => { spin.drag = false; spin.at = performance.now(); if (pad) delete pad.dataset.drag; };
      pad?.addEventListener("pointerdown", down);
      pad?.addEventListener("pointermove", move);
      pad?.addEventListener("pointerup", up);
      pad?.addEventListener("pointercancel", up);

      // the colour glitch while it changes model: the red, green and blue drawn apart, a few
      // torn bands shifted sideways (raw colour masks; three keeps its own mask at all-on)
      const ctx = renderer.getContext();
      const glitchRender = (amt: number) => {
        renderer.autoClear = false;
        renderer.clear();
        const sh = amt * W * 0.014 * (0.5 + Math.random());
        const jy = (Math.random() - 0.5) * amt * H * 0.01;
        [[true, false, false], [false, true, false], [false, false, true]].forEach(([r, gg, b], c) => {
          ctx.colorMask(r, gg, b, true);
          camera.setViewOffset(W, H, (c - 1) * sh, c === 1 ? jy : 0, W, H);
          renderer.clearDepth();
          renderer.render(scene, camera);
        });
        ctx.colorMask(true, true, true, true);
        renderer.setScissorTest(true);
        for (let n = 0; n < 4; n++) {
          if (Math.random() > amt) continue;
          const bh = H * (0.015 + Math.random() * 0.07), y = Math.random() * (H - bh);
          renderer.setScissor(0, H - y - bh, W, bh);
          renderer.clear();
          camera.setViewOffset(W, H, (Math.random() - 0.5) * W * 0.1 * amt, 0, W, H);
          renderer.render(scene, camera);
        }
        renderer.setScissorTest(false);
        camera.clearViewOffset();
        renderer.autoClear = true;
      };
      // SMPTE colour bars, with the vertical hold slipping now and then
      const BARS = ["#e8e8e8", "#f0f028", "#14fff0", "#14ff0a", "#e600e6", "#d21400", "#0000e6"];
      const MID = ["#0000e6", "#000", "#f0f028", "#000", "#14fff0", "#000", "#e8e8e8"];
      const GREYS = ["#e8e8e8", "#dedede", "#c4c4c4", "#ababab", "#929292", "#7f7f7f", "#4d4d4d"];
      const drawBars = (roll: number) => {
        const bw = SCREEN_W / 7;
        g.save(); g.translate(0, roll);
        for (let r = -1; r <= 0; r++) {
          const y0 = r * SCREEN_H;
          for (let i = 0; i < 7; i++) {
            g.fillStyle = BARS[i]; g.fillRect(i * bw, y0, bw + 1, SCREEN_H * 0.7);
            g.fillStyle = MID[i]; g.fillRect(i * bw, y0 + SCREEN_H * 0.7, bw + 1, SCREEN_H * 0.09);
            g.fillStyle = GREYS[i]; g.fillRect(i * bw, y0 + SCREEN_H * 0.79, bw + 1, SCREEN_H * 0.21);
          }
        }
        g.restore();
      };

      type Face = "skill" | "fall" | "contact";
      let hitAt = -1e9;   // when it last landed (a burst of static on impact)
      const draw = (t: number, face: Face, idx: number, now: number, bars: boolean) => {
        const { name, msg, state } = aboutTv.screen;
        const typing = face === "contact" && (msg.trim() || name.trim());
        g.fillStyle = "#0b0d0c"; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
        if (bars) drawBars(Math.random() < 0.15 ? Math.random() * SCREEN_H : 0);
        const burst = now - hitAt < 380;
        const snow = bars ? 0.12 : burst ? 0.6 : face === "fall" ? 0.45 : face === "skill" ? 0.05 : state === "sending" ? 0.5 : typing ? 0.06 : 0.35;
        const img = g.getImageData(0, 0, SCREEN_W, SCREEN_H), d = img.data;
        const amp = face === "skill" ? 90 : 200;
        for (let k = 0; k < d.length; k += 4) {
          const v = Math.random() < snow ? Math.random() * amp : 0;
          d[k] += v; d[k + 1] += v; d[k + 2] += v;
        }
        g.putImageData(img, 0, 0);
        g.fillStyle = "#ece9e2"; g.textBaseline = "top";
        g.save(); g.translate(SCREEN_W * 0.06, SCREEN_H * 0.06); g.scale(0.88, 0.88);   // inside the curved tube
        const blink = Math.floor(t * 2) % 2 === 0;
        if (bars) {
          // just the bars
        } else if (face === "skill") {
          g.globalAlpha = 0.85;
          g.font = `900 26px ${dot}`;
          g.fillText(`CH ${String(idx + 1).padStart(2, "0")}`, 30, 20);
          g.font = `500 14px ${mono}`; g.textAlign = "right";
          g.fillText(skills[idx]?.name.toUpperCase() ?? "", SCREEN_W - 30, 28);
          if (Math.floor(t * 1.5) % 2 === 0) g.fillText("● LIVE", SCREEN_W - 30, 50);
          g.textAlign = "left"; g.globalAlpha = 1;
        } else if (face === "fall" || burst) {
          if (blink) { g.font = `900 52px ${dot}`; g.fillText("NO SIGNAL", 34, 150); }
        } else {
          g.font = `900 30px ${dot}`;
          g.fillText("CH 05", 34, 28);
          g.font = `500 16px ${mono}`;
          g.fillText(state === "sending" ? "SENDING" : state === "sent" ? "SENT" : typing ? "● REC" : "", 380, 36);
          if (state === "sending") {
            g.font = `900 46px ${dot}`; g.fillText("SENDING" + ".".repeat(Math.floor(t * 4) % 4), 34, 160);
          } else if (state === "sent") {
            g.font = `900 46px ${dot}`; g.fillText("THANK YOU", 34, 150);
            g.font = `500 18px ${mono}`; g.fillText("Talk soon.", 36, 214);
          } else if (!typing) {
            if (blink) { g.font = `900 52px ${dot}`; g.fillText("NO SIGNAL", 34, 150); }
            g.font = `500 17px ${mono}`; g.fillText("Type a message to tune in", 36, 226);
          } else {
            g.font = `500 16px ${mono}`;
            g.fillText(`FROM: ${name.toUpperCase().slice(0, 30)}`, 36, 86);
            g.font = `800 26px ${dot}`;
            const lines = wrap(g, msg, SCREEN_W - 72).slice(-7);
            lines.forEach((l, i) => g.fillText(l + (i === lines.length - 1 && blink ? "_" : ""), 34, 124 + i * 34));
          }
        }
        g.restore();
        // scanlines and a soft rolling band
        g.fillStyle = "rgba(0,0,0,0.28)";
        for (let y = 0; y < SCREEN_H; y += 3) g.fillRect(0, y, SCREEN_W, 1);
        const band = ((t * 60) % (SCREEN_H + 80)) - 40;
        g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(0, band, SCREEN_W, 26);
        tex.needsUpdate = true; tex2.needsUpdate = true;
      };

      // the landing: "air" (scroll-driven: waiting, then falling), "land" (dropped into Contact),
      // "lift" (scrolled back up: it rises out of the top)
      let landed = false;
      let shown = 0, from = 0, swapAt = -1e9;           // the model on show, and the glitch into it
      let barsOn = false, barsUntil = 0, lastBars = false;
      let tumble = 0;     // extra spin that keeps going while it falls, even when you stop scrolling
      const TURNS = Math.PI * 20;   // tumble wraps here (every sine of it below repeats there too)
      const v = new THREE.Vector3();
      const e3 = new THREE.Euler(0, 0, 0, "YXZ");
      const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
      const lights = [scene.children[0], key, rim] as import("three").Light[];
      const lit = lights.map((l) => l.intensity);
      const scrMat = tv.screen?.material as import("three").MeshBasicMaterial | undefined;
      let raf = 0, last = 0, lastNow = performance.now();
      const t0 = performance.now();
      let bandAt = -1e9, band: [number, number] = [0, 0], awayDone = false;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const t = (now - t0) / 1000, dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
        const sy = scrollY, vh = H, wide = W / H > 1, asp = tv.aspect;
        const doSec = document.querySelector<HTMLElement>(".ab__do");
        const con = document.querySelector<HTMLElement>(".ab__contact");
        const slot = document.querySelector<HTMLElement>(".ab__contact-tv");
        const K = skills.length, T2 = doSec ? doSec.offsetTop : 1e9;
        const idx = Math.min(K - 1, Math.max(0, Math.round((sy - T2) / vh)));
        const endD = T2 + (K - 1) * vh;
        const cTop = con ? con.offsetTop : 1e9;
        // it lands as you arrive in Contact; the fall runs the whole way there with your scroll
        const landAt = Math.min(cTop, document.documentElement.scrollHeight - vh) - vh * 0.08;
        const fa = endD + vh * 0.12, fb = Math.max(fa + vh * 0.5, landAt);
        const f = clamp01((sy - fa) / (fb - fa));
        const p = sm(Math.max(fa, landAt - vh * 0.85), landAt, sy);   // into its spot in Contact
        const pe = p * p;                                              // speeding up, like a fall

        // "What I do": right half (phones: lower middle), waiting in the section: it scrolls in
        // with it, then stays while the section is pinned
        // narrow screens: in the free band between the step's text and the tabs (measured on the
        // pinned stage, so it never covers either)
        if (!wide && doSec && now - bandAt > 400) {
          bandAt = now;
          const pin = doSec.querySelector<HTMLElement>(".ab__do-pin"), tx = doSec.querySelector<HTMLElement>(".ab__do-text"), tb = doSec.querySelector<HTMLElement>(".ab__do-tabs");
          if (pin && tx && tb) {
            const pr = pin.getBoundingClientRect().top;
            band = [tx.getBoundingClientRect().bottom - pr + 16, tb.getBoundingClientRect().top - pr - 16];
          }
        }
        const bandH = band[1] - band[0];
        const hA = wide ? Math.min(H * 0.46, (W * 0.34) / asp) : Math.min(H * 0.3, (W * 0.7) / asp, bandH > 60 ? bandH * 0.92 : 1e9);
        const cxA = wide ? W * 0.76 : W * 0.5, cyA = (wide ? H * 0.5 : bandH > 60 ? (band[0] + band[1]) / 2 : H * 0.62) + Math.max(0, T2 - sy);
        const sway = reduced ? 0 : Math.sin(t * 0.5);
        const yawA = -0.22 + sway * 0.05 + turn.x * 0.12, pitchA = 0.05 - turn.y * 0.05;
        let cx = cxA, cy = cyA, h = hA, sx = 1, syc = 1, dim = 1;
        const face: Face = p > 0.9 ? "contact" : f > 0.02 ? "fall" : "skill";

        // the fall: it tips over and tumbles down behind the Experience years, swinging from
        // side to side (kept right of the timeline line), in the background
        const k = sm(0, 0.08, f);
        if (f > 0 && f < 1 && !reduced) tumble = (tumble + dt * 0.9) % TURNS;
        const cxAir = (wide ? W * 0.8 : W * 0.5) + Math.sin(f * Math.PI * 3 + t * 0.35) * (wide ? W * 0.065 : W * 0.14);
        const cyAir = cyA + (H * 0.56 - cyA) * sm(0, 0.25, f) + Math.sin(f * Math.PI * 5) * H * 0.03
          + (reduced ? 0 : Math.sin(t * 1.3) * H * 0.012);
        cx += (cxAir - cx) * k; cy += (cyAir - cy) * k;
        h = hA * (1 - 0.3 * sm(0, 0.2, f));
        dim = 1 - 0.45 * sm(0.05, 0.2, f);
        // over the Tech stack section it keeps clear of the logo row: smaller, dimmer, up in the
        // empty top-right corner
        const stk = document.querySelector<HTMLElement>(".ab__stack")?.getBoundingClientRect();
        if (stk) {
          // (it moves aside early, before the logo row is on screen, and stays well above it)
          const sh = sm(H * 1.1, H * 0.6, stk.top) * sm(H * 0.05, H * 0.45, stk.bottom);
          cx += ((wide ? W * 0.86 : W * 0.8) - cx) * sh; cy += (H * 0.15 - cy) * sh;
          h *= 1 - 0.58 * sh; dim *= 1 - 0.5 * sh;
        }
        qA.setFromEuler(e3.set(pitchA, yawA, 0));
        qB.setFromEuler(e3.set(pitchA + Math.sin(f * 7 + tumble * 0.7) * 0.6, yawA + f * Math.PI * 4 + tumble, f * 2.4 + Math.sin(tumble * 0.8) * 0.4));
        // the shortest way between the poses, so scrolling back up never unwinds extra turns
        qA.slerp(qB, k);

        // Contact: at rest beside the form, turned to it, tilt with a drag
        if (!spin.drag) {
          spin.yaw = pull(spin.yaw, spin.vy, MAX_YAW); spin.vy *= 0.85;
          spin.pitch = pull(spin.pitch, spin.vp, MAX_PITCH); spin.vp *= 0.85;
          if (now - spin.at > 2500) { spin.yaw *= 0.97; spin.pitch *= 0.97; }   // back to face you
        }
        if (p > 0) {
          const r = slot?.getBoundingClientRect();
          const hS = r ? r.height * 0.647 : hA, cxS = r ? r.left + r.width / 2 : cxA;
          const cyS = (r ? r.top + r.height * 0.55 : H / 2) + (reduced ? 0 : Math.sin(t * 0.8) * hS * 0.015);
          cx += (cxS - cx) * pe; cy += (cyS - cy) * pe; h += (hS - h) * pe; dim += (1 - dim) * pe;
          qB.setFromEuler(e3.set(0.06 - turn.y * 0.08 + spin.pitch, -0.45 + sway * 0.12 + turn.x * 0.25 + spin.yaw, 0));
          qA.slerp(qB, pe);
        }
        rig.quaternion.copy(qA);

        // landing: it squashes, bounces a little and rattles before settling, and the page jolts
        if (!landed && p > 0.995) {
          landed = true; hitAt = now;
          if (!reduced) {
            con?.setAttribute("data-thud", "on");
            window.setTimeout(() => con?.removeAttribute("data-thud"), 450);
          }
        } else if (landed && p < 0.85) landed = false;
        const a = (now - hitAt) / 1000;
        if (landed && !reduced && a < 2) {
          const sq = Math.exp(-9 * a) * Math.cos(a * 22);
          syc = 1 - 0.1 * sq; sx = 1 + 0.06 * sq;
          cy += (1 - syc) * h * 0.5;                               // squash onto its feet
          cy -= h * 0.07 * Math.exp(-6 * a) * Math.abs(Math.sin(a * 13));
          cx += h * 0.012 * Math.exp(-5 * a) * Math.sin(a * 47);
          rig.rotateZ(0.05 * Math.exp(-5 * a) * Math.sin(a * 38));
          rig.rotateY(0.03 * Math.exp(-5 * a) * Math.sin(a * 31));
        }

        // place it: px → world at the TV's depth; the model is 2 units tall
        const s = (h * upp) / 2;
        rig.position.set((cx - W / 2) * upp, -(cy - H / 2) * upp, 0);
        rig.scale.set(s * sx, s * syc, s * sx);
        // in the background it is darker (lights down, not see-through)
        lights.forEach((l, i) => (l.intensity = lit[i] * dim));
        scrMat?.color.setScalar(dim);
        scrMats.forEach((m) => m.color.setScalar(dim));

        // which model: by how far it has fallen; the last one lands, then glitches back
        let want = 0;
        for (let i = SWAP_AT.length - 1; i > 0; i--) if (f >= SWAP_AT[i]) { want = i; break; }
        if (p > 0) want = SWAP_AT.length - 1;
        if (landed && a > BACK_S) want = 0;
        if (!models[want]) want = 0;
        if (want !== shown) { from = shown; shown = want; swapAt = now; }
        const gt = (now - swapAt) / 1000, glitching = !reduced && gt < GLITCH_S;
        // while it glitches it flickers between the two, more of the new one as it goes
        const pick = glitching && Math.random() > gt / GLITCH_S ? from : shown;
        models.forEach((m, i) => { if (m) m.visible = i === pick; });
        // the screen: random switches between colour bars and "NO SIGNAL" while it falls
        if (face === "fall" && now > barsUntil) {
          barsOn = Math.random() < 0.45;
          barsUntil = now + (barsOn ? 300 + Math.random() * 900 : 500 + Math.random() * 1500);
        }
        const bars = glitching || (face === "fall" && barsOn);

        // the picture's corners on the viewport, for the particles
        if (tv.screen) {
          rig.updateMatrixWorld(true);
          tv.corners.forEach((c, k) => {
            v.copy(c); tv.screen!.localToWorld(v); v.project(camera);
            aboutTv.px[k * 2] = (v.x * 0.5 + 0.5) * W;
            aboutTv.px[k * 2 + 1] = (0.5 - v.y * 0.5) * H;
          });
          aboutTv.ready = true;
        }
        // narrow screens: no room beside the Experience text, so it leaves while it falls (a
        // glitch out) and comes back for the landing in Contact
        const away = !wide && !reduced && f > 0.06 && p < 0.03;
        if (away) {
          if (!awayDone) { renderer.clear(); host.style.filter = ""; awayDone = true; }
          return;
        }
        awayDone = false;
        // draw only while some of it can be on screen
        const reach = h * 1.2;
        if (cy - reach > H || cy + reach < 0) return;
        if (now - last > 1000 / 24 || (glitching && bars !== lastBars)) { draw(t, face, idx, now, bars); last = now; lastBars = bars; }   // TV-ish 24 fps
        if (glitching) {
          const amt = (1 - gt / GLITCH_S) * (0.6 + 0.4 * Math.random());
          glitchRender(amt);
          host.style.filter = Math.random() < 0.6 ? `hue-rotate(${Math.round(Math.random() * 360)}deg) saturate(${(1.5 + Math.random() * 2).toFixed(2)})` : "";
        } else {
          if (host.style.filter) host.style.filter = "";
          renderer.render(scene, camera);
        }
      };
      raf = requestAnimationFrame(frame);
      stop = () => {
        window.clearTimeout(later);
        cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); aboutTv.ready = false;
        pad?.removeEventListener("pointerdown", down); pad?.removeEventListener("pointermove", move);
        pad?.removeEventListener("pointerup", up); pad?.removeEventListener("pointercancel", up);
      };
    }
    return () => { alive = false; window.clearTimeout(go); stop(); };
  }, [turn]);
  return <div ref={ref} className="ab__abouttv" aria-hidden="true" />;
}
