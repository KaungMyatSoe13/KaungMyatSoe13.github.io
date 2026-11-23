"use client";

import { useEffect, useRef, useState } from "react";
import { particlesReady, scatter, scatterFresh } from "@/lib/scatter";

/*
 * A project image that builds itself from particles, then turns into the real image.
 *
 * 1. The image is sampled on a coarse grid; each sample becomes a particle with that colour.
 * 2. Particles start scattered all over the screen (where the clicked names flew to),
 *    dark like the names, and regather into the picture, taking on its colours as they
 *    settle. The pointer can push them.
 * 3. Once they have gathered, the real <img> fades in and the particles fade out.
 *
 * The canvas covers the whole screen while it runs (particles start off-screen) and is
 * removed afterwards. Without WebGL2, or with reduced motion, the image simply shows.
 */

const GATHER_S = 2.4; // seconds for the scattered particles to regather
const HOLD_S = 0.7; // seconds the finished particle picture holds before turning real
const REVEAL_S = 2.0; // seconds for particles → real image

const VERT = `#version 300 es
in vec2 a_pos;
in vec3 a_col;
in float a_t;    // arrival 0..1
in float a_lead; // 1: one of the scattered particles handed over from the home page
uniform vec2 u_res;
uniform float u_size; // final square size
uniform float u_dot;  // size of the name particles they came from
out vec3 v_col;
out float v_a;
void main(){
  vec2 c = a_pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  float land = smoothstep(0.55, 1.0, a_t);
  // Particles keep the small dot size while flying and grow only as they land.
  gl_PointSize = mix(u_dot, u_size, land);
  if (a_lead > 0.5) {
    // Handed-over particles start as dark ink and take on the image colour as they land.
    v_col = mix(vec3(0.055), a_col, smoothstep(0.35, 1.0, a_t));
    v_a = 1.0;
  } else {
    // The extra particles the picture needs fade in quietly near the end.
    v_col = a_col;
    v_a = smoothstep(0.45, 1.0, a_t);
  }
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 v_col;
in float v_a;
uniform float u_alpha;
out vec4 o;
void main(){ o = vec4(v_col, u_alpha * v_a); }`;

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
  gl.bindAttribLocation(p, 1, "a_col");
  gl.bindAttribLocation(p, 2, "a_t");
  gl.bindAttribLocation(p, 3, "a_lead");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

// ease in-out: a calm start and a soft landing
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** How many particles to start with when we didn't come from a click (direct visit). */
const DEFAULT_LEADS = 30000;

export default function ParticleImage({ src, alt }: { src: string; alt: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // "particles": canvas running, image hidden · "reveal": crossfading · "done": image only
  const [phase, setPhase] = useState<"particles" | "reveal" | "done">("particles");
  const phaseRef = useRef<"particles" | "reveal" | "done">("particles");

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    let cancelled = false;
    let raf = 0;
    const cleanups: (() => void)[] = [];

    // The real <img> sizes the box (no placeholder shape). It was preloaded while the
    // names scattered on the home page, so this is usually instant.
    const img = imgRef.current!;
    img.decode().then(() => {
      if (cancelled) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPhase("done"); return; }
      const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false, alpha: true });
      if (!gl) { setPhase("done"); return; }
      let prog: WebGLProgram;
      try { prog = compile(gl); } catch (e) { console.warn("[image] no particles", e); setPhase("done"); return; }

      // Wait one frame so the box has its final size from the aspect ratio.
      requestAnimationFrame(() => {
        if (cancelled) return;
        const r = box.getBoundingClientRect();
        const step = r.width < 600 ? 3.5 : 3; // px between particles: smaller = more, finer particles
        const cols = Math.max(1, Math.round(r.width / step));
        const rows = Math.max(1, Math.round(r.height / step));
        const off = document.createElement("canvas");
        off.width = cols; off.height = rows;
        const ctx = off.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, cols, rows);
        const data = ctx.getImageData(0, 0, cols, rows).data;

        const N = cols * rows;
        const u = new Float32Array(N), v = new Float32Array(N), delay = new Float32Array(N), seed = new Float32Array(N);
        const sx = new Float32Array(N), sy = new Float32Array(N);
        const px = new Float32Array(N), py = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
        const pos = new Float32Array(N * 2), col = new Float32Array(N * 3), prog01 = new Float32Array(N);
        const lead = new Float32Array(N);
        const vw = window.innerWidth, vh = window.innerHeight;
        // Take over with exactly the particles scattered by the home page (same count,
        // same spots); a direct visit starts from a random scatter instead.
        const handoff = scatterFresh();
        const leads = handoff ? scatter.n : DEFAULT_LEADS;
        const leadShare = Math.min(1, leads / N);
        let nextLead = 0;
        for (let j = 0, k = 0; j < rows; j++)
          for (let i = 0; i < cols; i++, k++) {
            u[k] = (i + 0.5) / cols; v[k] = (j + 0.5) / rows;
            col[k * 3] = data[k * 4] / 255; col[k * 3 + 1] = data[k * 4 + 1] / 255; col[k * 3 + 2] = data[k * 4 + 2] / 255;
            delay[k] = Math.random(); // regather in no particular order
            seed[k] = Math.random() * 1000;
            lead[k] = Math.random() < leadShare ? 1 : 0;
            if (lead[k]) {
              if (handoff) {
                const j = nextLead++ % scatter.n;
                sx[k] = scatter.x[j]; sy[k] = scatter.y[j]; // exactly where the names flew to
              } else {
                sx[k] = Math.random() * vw;
                sy[k] = Math.random() * vh;
              }
            } else {
              // extras start near their spot, invisible, and fade in as they settle
              sx[k] = r.left + u[k] * r.width + (Math.random() - 0.5) * 80;
              sy[k] = r.top + v[k] * r.height + (Math.random() - 0.5) * 80;
            }
            px[k] = sx[k]; py[k] = sy[k];
          }

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const fit = () => {
          canvas.width = Math.round(window.innerWidth * dpr);
          canvas.height = Math.round(window.innerHeight * dpr);
        };
        fit();
        window.addEventListener("resize", fit);
        cleanups.push(() => window.removeEventListener("resize", fit));

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, pos.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const colBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
        gl.bufferData(gl.ARRAY_BUFFER, col, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        const tBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, tBuf);
        gl.bufferData(gl.ARRAY_BUFFER, prog01.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
        const leadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, leadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, lead, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
        const L = {
          dot: gl.getUniformLocation(prog, "u_dot"),
          res: gl.getUniformLocation(prog, "u_res"),
          size: gl.getUniformLocation(prog, "u_size"),
          alpha: gl.getUniformLocation(prog, "u_alpha"),
        };

        const mouse = { x: -9999, y: -9999 };
        const onMove = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
        window.addEventListener("pointermove", onMove, { passive: true });
        cleanups.push(() => window.removeEventListener("pointermove", onMove));

        const t0 = performance.now();
        let revealAt = 0;
        let readySent = false;
        const frame = (now: number) => {
          const t = (now - t0) / 1000;
          const b = box.getBoundingClientRect(); // follows the page if it scrolls
          const T = t / GATHER_S;
          let settled = true;
          for (let k = 0; k < N; k++) {
            const a = Math.min(1, Math.max(0, T * 1.35 - delay[k] * 0.35));
            if (a < 1) settled = false;
            const e = ease(a);
            const hx = b.left + u[k] * b.width, hy = b.top + v[k] * b.height;
            const w = (1 - e) * 24;
            const tx = sx[k] + (hx - sx[k]) * e + Math.sin(t * 1.7 + seed[k]) * w;
            const ty = sy[k] + (hy - sy[k]) * e + Math.cos(t * 1.3 + seed[k] * 1.7) * w;
            vx[k] += (tx - px[k]) * 0.08;
            vy[k] += (ty - py[k]) * 0.08;
            const dx = px[k] - mouse.x, dy = py[k] - mouse.y, d2 = dx * dx + dy * dy;
            if (d2 < 6400 && d2 > 0.01) {
              const d = Math.sqrt(d2), f = (1 - d / 80) * 2.2;
              vx[k] += (dx / d) * f; vy[k] += (dy / d) * f;
            }
            vx[k] *= 0.78; vy[k] *= 0.78;
            px[k] += vx[k]; py[k] += vy[k];
            pos[k * 2] = px[k]; pos[k * 2 + 1] = py[k];
            prog01[k] = a;
          }
          if (settled && !revealAt) revealAt = now + HOLD_S * 1000;
          if (revealAt && now >= revealAt && phaseRef.current === "particles") { phaseRef.current = "reveal"; setPhase("reveal"); }
          const fade = revealAt ? Math.min(1, Math.max(0, (now - revealAt) / 1000 / REVEAL_S)) : 0;

          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.useProgram(prog);
          gl.uniform2f(L.res, window.innerWidth, window.innerHeight);
          gl.uniform1f(L.size, Math.ceil(step * dpr)); // just touching: no gaps, still fine
          gl.uniform1f(L.dot, 1.5 * dpr); // same as the name particles
          gl.uniform1f(L.alpha, 1 - fade);
          gl.bindVertexArray(vao);
          gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
          gl.bindBuffer(gl.ARRAY_BUFFER, tBuf);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, prog01);
          gl.drawArrays(gl.POINTS, 0, N);
          if (!readySent) { readySent = true; particlesReady(); }

          if (fade >= 1) { setPhase("done"); return; }
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      });
    }).catch(() => setPhase("done"));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cleanups.forEach((f) => f());
    };
  }, [src]);

  return (
    <div
      ref={boxRef}
      className="pimg"
      data-phase={phase}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={src} alt={alt} className="pimg__img" decoding="async" style={{ transitionDuration: `${REVEAL_S}s` }} />
      {phase !== "done" && <canvas ref={canvasRef} className="pimg__canvas" aria-hidden="true" />}
    </div>
  );
}
