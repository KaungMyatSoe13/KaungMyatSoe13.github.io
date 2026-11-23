"use client";

import { useEffect, useRef, type RefObject } from "react";
import { beginScatter, particlesReady, scatter, scatterFresh } from "@/lib/scatter";

/*
 * Project names drawn as particles.
 *
 * The real names stay in the DOM (links, hover, screen readers) but are made transparent.
 * This canvas samples each letter's pixels and puts a particle on each sample. As the
 * section scrolls into place, particles stream in from the right and settle into the
 * letters, left side first. Once there, the pointer pushes them away and a spring pulls
 * them back, and the end of each word frays into slowly drifting, fading dust. The
 * hovered row's particles turn to the accent colour.
 *
 * Positions are simulated on the CPU (typed arrays) and drawn as WebGL2 points.
 */

const INK = [0.055, 0.055, 0.055];
const ACCENT = [1.0, 0.353, 0.212];

const VERT = `#version 300 es
in vec2 a_pos;
in vec2 a_meta; // x: row index, y: alpha 0..1
uniform vec2 u_res;
uniform vec2 u_off; // where the section sits on the canvas (gather mode: full screen)
uniform float u_size;
out float v_row;
out float v_t;
void main(){
  vec2 c = (a_pos + u_off) / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  gl_PointSize = u_size;
  v_row = a_meta.x;
  v_t = a_meta.y;
}`;

const FRAG = `#version 300 es
precision mediump float;
in float v_row;
in float v_t;
uniform float u_hover;
uniform float u_dim;
uniform vec3 u_ink;
uniform vec3 u_accent;
out vec4 o;
void main(){
  bool on = abs(v_row - u_hover) < 0.5;
  vec3 c = on ? u_accent : u_ink;
  float dim = (u_hover >= 0.0 && !on) ? u_dim : 1.0; // other names fade while one is hovered
  o = vec4(c, v_t * dim);
}`;

function compile(gl: WebGL2RenderingContext) {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.bindAttribLocation(p, 1, "a_meta");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** gather mode: seconds to regather (matches ParticleImage's GATHER_S). */
const GATHER_S = 2.4;

/** Frayed word endings: where along the word fraying starts (0..1), share of those
 *  particles that drift off as dust, and how far (px) they drift before fading out. */
const FRAY_START = 0.8;
const DUST_SHARE = 0.22;
const DUST_DRIFT = 45;
/** Project-page title: seconds for the name to stream in. */
const ARRIVE_S = 1.8;

export default function ParticleNames({
  sectionRef,
  hoverRef,
  exitRef,
  onReady,
  arrival = "scroll",
  highlight = "accent",
  dim = 0.28,
  density = 1.5,
  dotSize = 1.5,
  fray = FRAY_START,
}: {
  sectionRef: RefObject<HTMLElement | null>;
  hoverRef?: RefObject<number | null>;
  /** Set when a project is clicked: every particle scatters across the screen. */
  exitRef?: RefObject<{ row: number; t: number } | null>;
  onReady: (ok: boolean) => void;
  /** "scroll": names arrive as the section scrolls into place (home page).
   *  "time": they stream in from the right right after mount.
   *  "gather": they start scattered over the whole screen and regather (project page). */
  arrival?: "scroll" | "time" | "gather";
  /** colour of the highlighted row: orange accent, or plain ink */
  highlight?: "accent" | "ink";
  /** opacity of the other rows while one is highlighted */
  dim?: number;
  /** px between sampled particles (smaller = denser, easier to read) */
  density?: number;
  /** particle size in px */
  dotSize?: number;
  /** where along each word the frayed, fading end starts (0..1; 1 = none) */
  fray?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    // gather: start scattered and regather. On the home page this also happens when we
    // arrive from a project page (a fresh hand-off), instead of the scroll-in stream.
    const fromHandoff = scatterFresh();
    const gather = arrival === "gather" || fromHandoff;
    let readySent = false;
    const screenCanvas = arrival === "gather"; // full-screen canvas (project page title)
    let builtAt = performance.now();
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onReady(false); return; }
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false, alpha: true });
    if (!gl) { onReady(false); return; }
    let prog: WebGLProgram;
    try { prog = compile(gl); } catch (e) { console.warn("[names] falling back to text", e); onReady(false); return; }
    const L = {
      res: gl.getUniformLocation(prog, "u_res"),
      off: gl.getUniformLocation(prog, "u_off"),
      size: gl.getUniformLocation(prog, "u_size"),
      hover: gl.getUniformLocation(prog, "u_hover"),
      ink: gl.getUniformLocation(prog, "u_ink"),
      accent: gl.getUniformLocation(prog, "u_accent"),
      dim: gl.getUniformLocation(prog, "u_dim"),
    };
    const vao = gl.createVertexArray();
    const posBuf = gl.createBuffer();
    const metaBuf = gl.createBuffer();

    // Particle state
    let N = 0;
    let px = new Float32Array(0), py = new Float32Array(0), vx = new Float32Array(0), vy = new Float32Array(0);
    let hx = new Float32Array(0), hy = new Float32Array(0), sx = new Float32Array(0), sy = new Float32Array(0);
    let delay = new Float32Array(0), seed = new Float32Array(0), row = new Float32Array(0), tail = new Float32Array(0);
    let pos = new Float32Array(0), meta = new Float32Array(0);
    let W = 0, H = 0, dpr = 1, step = 2;

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = section.clientWidth;
      H = section.clientHeight;
      // gather mode: the canvas covers the whole screen so particles can start anywhere
      canvas.width = Math.round((screenCanvas ? window.innerWidth : W) * dpr);
      canvas.height = Math.round((screenCanvas ? window.innerHeight : H) * dpr);
      step = density; // sample spacing in px: smaller = more particles

      // Draw every letter at its exact DOM spot into an offscreen canvas (1 CSS px = 1 px).
      const off = document.createElement("canvas");
      off.width = W; off.height = H;
      const ctx = off.getContext("2d", { willReadFrequently: true })!;
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000";
      const sr = section.getBoundingClientRect();
      const rows = [...section.querySelectorAll<HTMLElement>(".work-row__name")];
      const rowSpan: { x0: number; x1: number }[] = [];
      rows.forEach((name, r) => {
        const cs = getComputedStyle(name);
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        let x0 = Infinity, x1 = -Infinity;
        name.querySelectorAll<HTMLElement>(".roll__ch").forEach((ch) => {
          const cr = ch.getBoundingClientRect();
          const text = ch.firstElementChild?.textContent ?? "";
          ctx.fillStyle = `rgb(${(r + 1) * 40},0,0)`; // red channel encodes the row: (row + 1) * 40
          ctx.fillText(text, cr.left - sr.left, cr.top - sr.top + cr.height / 2);
          x0 = Math.min(x0, cr.left - sr.left); x1 = Math.max(x1, cr.right - sr.left);
        });
        rowSpan[r] = { x0, x1 };
      });
      const img = ctx.getImageData(0, 0, W, H).data;

      const pts: number[] = [];
      for (let y = 0; y < H; y += step)
        for (let x = 0; x < W; x += step) {
          const i = ((y | 0) * W + (x | 0)) * 4;
          if (img[i + 3] > 140) pts.push(x + (Math.random() - 0.5) * step, y + (Math.random() - 0.5) * step, Math.round(img[i] / 40) - 1);
        }
      N = pts.length / 3;
      px = new Float32Array(N); py = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
      hx = new Float32Array(N); hy = new Float32Array(N); sx = new Float32Array(N); sy = new Float32Array(N);
      delay = new Float32Array(N); seed = new Float32Array(N); row = new Float32Array(N); tail = new Float32Array(N);
      pos = new Float32Array(N * 2); meta = new Float32Array(N * 2);
      for (let k = 0; k < N; k++) {
        const x = pts[k * 3], y = pts[k * 3 + 1], r = Math.max(0, pts[k * 3 + 2]);
        hx[k] = x; hy[k] = y; row[k] = r;
        const span = rowSpan[r] ?? { x0: 0, x1: W };
        const nx = (x - span.x0) / Math.max(1, span.x1 - span.x0);
        // scroll/time: left side settles first, with grain · gather: no particular order
        delay[k] = gather ? Math.random() : 0.65 * nx + 0.35 * Math.random();
        // The last ~20% of each word frays: those particles drift and fade (FRAY_START..1).
        const tt = Math.min(1, Math.max(0, (nx - fray) / (1 - fray)));
        tail[k] = tt * tt * (3 - 2 * tt);
        seed[k] = Math.random() * 1000;
        if (gather) {
          if (fromHandoff) {
            // start exactly where the previous page's particles are
            const j = (Math.random() * scatter.n) | 0;
            sx[k] = scatter.x[j] - sr.left;
            sy[k] = scatter.y[j] - sr.top;
          } else {
            // scattered across the whole screen, like the image's particles
            sx[k] = Math.random() * window.innerWidth - sr.left;
            sy[k] = Math.random() * window.innerHeight - sr.top;
          }
        } else {
          sx[k] = W + Math.random() * W * 0.5 + nx * W * 0.3; // a stream entering from the right
          sy[k] = y + (Math.random() - 0.5) * 140;
        }
        px[k] = sx[k]; py[k] = sy[k];
      }
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pos.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, metaBuf);
      gl.bufferData(gl.ARRAY_BUFFER, meta.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    };

    // Pointer in section coordinates
    const mouse = { x: -9999, y: -9999, on: false };
    const onMove = (e: PointerEvent) => {
      const r = section.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.on = true;
    };
    const onLeave = () => { mouse.on = false; };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    let ready = false;
    const start = () => {
      build();
      builtAt = performance.now();
      if (!ready) { ready = true; onReady(true); }
    };
    // Wait for the web fonts so the sampled letters match the real ones.
    (document.fonts?.ready ?? Promise.resolve()).then(start);

    let resizeT = 0;
    const onResize = () => { clearTimeout(resizeT); resizeT = window.setTimeout(build, 150); };
    window.addEventListener("resize", onResize);

    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(section);

    let raf = 0;
    let handedOff = false;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || !N) return;
      const t = (now - t0) / 1000;
      // Arrival progress: home page = scroll position (after the ink drains, done at the
      // top); project page = time since the title appeared.
      const sRect = section.getBoundingClientRect();
      const top = sRect.top;
      const g = arrival === "time"
        ? Math.min(1, (now - t0) / 1000 / ARRIVE_S)
        : Math.min(1, Math.max(0, 1 - top / (window.innerHeight * 0.45)));
      const gT = (now - builtAt) / 1000 / GATHER_S;

      const R = 70, R2 = R * R;
      const exit = exitRef?.current ?? null;
      const vw = window.innerWidth, vh = window.innerHeight;
      const ex = exit ? Math.min(1, (now - exit.t) / 650) : 0;
      const exE = ease(ex);
      // Hand-off: share where our particles are, so the transition layer can keep them on
      // screen during the page change and the project page can start from the same spots.
      if (ex > 0 && !handedOff) { handedOff = true; beginScatter(N, true); }
      for (let k = 0; k < N; k++) {
        let a: number;
        if (gather) {
          // same timing and easing as the image regathering below it
          a = Math.min(1, Math.max(0, gT * 1.35 - delay[k] * 0.35));
        } else {
          const G = Math.min(1, Math.max(0, (g - row[k] * 0.1) / 0.5));
          a = Math.min(1, Math.max(0, (G * 1.6 - delay[k] * 0.6)));
        }
        const e = gather ? easeIO(a) : ease(a);
        // moving target: from the stream to home, with a drifting wobble that dies on arrival
        const w = (1 - e) * 18;
        let tx = sx[k] + (hx[k] - sx[k]) * e + Math.sin(t * 1.7 + seed[k]) * w;
        let ty = sy[k] + (hy[k] - sy[k]) * e + Math.cos(t * 1.3 + seed[k] * 1.7) * w;
        // Frayed end: once settled, tail particles wander slowly; some drift off to the
        // right as dust and fade, then quietly start again. The word stays readable.
        let alpha = 0.25 + 0.75 * a;
        const tf = tail[k] * e;
        if (tf > 0) {
          tx += Math.sin(t * 0.5 + seed[k]) * 2.5 * tf;
          ty += Math.cos(t * 0.4 + seed[k] * 1.3) * 2 * tf;
          if (seed[k] % 1 < DUST_SHARE) {
            const ph = (t * 0.06 + seed[k] * 0.37) % 1;
            tx += ph * DUST_DRIFT * tf;
            ty += Math.sin(ph * 6.283 + seed[k]) * 4 * tf;
            alpha *= 1 - ph * tf;
          } else {
            alpha *= 1 - 0.15 * tf;
          }
        }
        // Exit (a project was clicked): every particle scatters to its own random spot
        // across the whole screen; the project page then regathers them into the image.
        const exitFade = 1;
        if (ex > 0) {
          const fx = (seed[k] * 0.7311) % 1, fy = (seed[k] * 0.3779) % 1;
          const spx = fx * vw - sRect.left, spy = fy * vh - top;
          tx += (spx - tx) * exE;
          ty += (spy - ty) * exE;
          alpha = Math.max(alpha, exE);
        }
        // spring toward the target
        vx[k] += (tx - px[k]) * 0.09;
        vy[k] += (ty - py[k]) * 0.09;
        // pointer pushes settled particles away
        if (mouse.on && a > 0.5) {
          const dx = px[k] - mouse.x, dy = py[k] - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const f = (1 - d / R) * 2.6;
            vx[k] += (dx / d) * f; vy[k] += (dy / d) * f;
          }
        }
        vx[k] *= 0.8; vy[k] *= 0.8;
        px[k] += vx[k]; py[k] += vy[k];
        pos[k * 2] = px[k]; pos[k * 2 + 1] = py[k];
        meta[k * 2] = row[k]; meta[k * 2 + 1] = alpha * exitFade;
        if (handedOff) { scatter.x[k] = px[k] + sRect.left; scatter.y[k] = py[k] + sRect.top; }
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);
      if (screenCanvas) {
        gl.uniform2f(L.res, window.innerWidth, window.innerHeight);
        gl.uniform2f(L.off, sRect.left, sRect.top);
      } else {
        gl.uniform2f(L.res, W, H);
        gl.uniform2f(L.off, 0, 0);
      }
      gl.uniform1f(L.size, dotSize * dpr);
      gl.uniform1f(L.hover, ex > 0 ? -10 : hoverRef?.current ?? -10);
      gl.uniform3fv(L.ink, INK);
      gl.uniform3fv(L.accent, highlight === "ink" ? INK : ACCENT);
      gl.uniform1f(L.dim, dim);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, metaBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, meta);
      gl.drawArrays(gl.POINTS, 0, N);
      if (!readySent && gather) { readySent = true; particlesReady(); }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, [sectionRef, hoverRef, exitRef, onReady, arrival, highlight, dim, density, dotSize, fray]);
  // (gather mode on the home page only happens right after a hand-off from a project page)

  return (
    <canvas
      ref={canvasRef}
      className={arrival === "gather" ? "names-canvas names-canvas--screen" : "names-canvas"}
      aria-hidden="true"
    />
  );
}
