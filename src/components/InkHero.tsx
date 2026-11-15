"use client";

import { useEffect, useRef, useState } from "react";
import { K_STROKES } from "@/lib/kMark";
import { site } from "@/content/site";

/*
 * The landing screen: a soft ink "K" on paper.
 * - The pointer drags the ink; it eases back into the letter.
 * - Scrolling floods the screen with ink, which hands over to the dark project list.
 *
 * Pipeline (WebGL2):
 *   1. The K strokes are drawn into a 2D canvas (the mask) and blurred twice on the GPU.
 *      Thresholding that blurred "field" at 0.5 gives the soft, melted letter.
 *   2. A small half-float texture holds a displacement field. The pointer splats into it
 *      each frame; it advects, diffuses and decays, so the smear springs back.
 *   3. The final pass samples the field through the displacement, adds the scroll
 *      flood term plus noise, and thresholds to ink or paper.
 */

const PAPER: [number, number, number] = [0.949, 0.937, 0.914];
const INK: [number, number, number] = [0.055, 0.055, 0.055];

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const BLUR = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src; uniform vec2 u_step;
void main(){
  float s = 0.0, wsum = 0.0;
  for (int i = -12; i <= 12; i++) {
    float fi = float(i);
    float w = exp(-fi * fi / 46.0);
    s += texture(u_src, v_uv + u_step * fi).r * w;
    wsum += w;
  }
  o = vec4(vec3(s / wsum), 1.0);
}`;

const VEL = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_vel; uniform vec2 u_texel; uniform vec2 u_mouse; uniform vec2 u_dir;
uniform float u_radius; uniform float u_aspect; uniform float u_decay;
void main(){
  vec2 v = texture(u_vel, v_uv).xy;
  vec2 back = v_uv - v * 0.12;
  vec2 a = texture(u_vel, back).xy;
  vec2 n = texture(u_vel, back + vec2(u_texel.x, 0.0)).xy + texture(u_vel, back - vec2(u_texel.x, 0.0)).xy
         + texture(u_vel, back + vec2(0.0, u_texel.y)).xy + texture(u_vel, back - vec2(0.0, u_texel.y)).xy;
  a = mix(a, n * 0.25, 0.4) * u_decay;
  vec2 d = v_uv - u_mouse; d.x *= u_aspect;
  a += u_dir * exp(-dot(d, d) / u_radius);
  float l = length(a);
  if (l > 0.3) a *= 0.3 / l;
  o = vec4(a, 0.0, 1.0);
}`;

const RENDER = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_field; uniform sampler2D u_vel;
uniform float u_p; uniform float u_t; uniform float u_aspect;
uniform vec3 u_ink; uniform vec3 u_paper;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec2 uv = v_uv;
  vec2 q = vec2(uv.x * u_aspect, uv.y);
  vec2 v = texture(u_vel, uv).xy;
  vec2 w = vec2(fbm(q * 2.2 + u_t * 0.04), fbm(q * 2.2 + 9.1 - u_t * 0.04)) - 0.5;
  vec2 suv = uv - v * 0.55 + w * (0.006 + u_p * 0.09);
  float f = texture(u_field, suv).r;
  // The flood front grows out from the letter (centre + the K's own field), with ragged noise edges.
  float n = fbm(q * 3.4 + w * 2.0 + vec2(3.7, u_t * 0.015));
  vec2 c = vec2(0.5 * u_aspect, 0.5);
  float d = length(q - c) / length(c);
  float front = pow(u_p, 1.6) * 1.5 - d + f * 0.25 - 0.06 + (n - 0.5) * 0.5 * smoothstep(0.0, 0.25, u_p);
  float level = max(f, 0.5 + front * 2.5);
  float aa = fwidth(level) + 0.0015;
  float ink = smoothstep(0.5 - aa, 0.5 + aa, level);
  o = vec4(mix(u_paper, u_ink, ink), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  const loc: Record<string, WebGLUniformLocation | null> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i)!.name;
    loc[name] = gl.getUniformLocation(p, name);
  }
  return { p, loc };
}

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };

function target(gl: WebGL2RenderingContext, w: number, h: number, half: boolean): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return { tex, fbo, w, h };
}

/** Where the K sits on a w x h surface: a square box, centred. */
function kBox(w: number, h: number) {
  const s = Math.min(h * 0.6, w * 0.82);
  return { s, x: (w - s) / 2, y: (h - s) / 2 };
}

function drawMask(c: HTMLCanvasElement, w: number, h: number) {
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const b = kBox(w, h);
  ctx.setTransform(b.s / 100, 0, 0, b.s / 100, b.x, b.y);
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const k of K_STROKES) {
    ctx.lineWidth = k.w;
    ctx.stroke(new Path2D(k.d));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return b;
}

export default function InkHero() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const floodRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let progress = 0;
    let shown = 0;
    const readScroll = () => {
      const r = wrap.getBoundingClientRect();
      const span = window.innerHeight * 0.6; // the flood finishes after 60% of a screen of scroll
      progress = Math.min(1, Math.max(0, -r.top / span));
    };
    readScroll();

    // No WebGL2 (or no half-float targets): the SVG K stays, and a plain fade carries the flood.
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
    const halfOk = !!gl && !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    if (!gl || !halfOk) {
      const onScroll = () => {
        readScroll();
        if (floodRef.current) floodRef.current.style.opacity = String(Math.min(1, progress * 1.4));
        wrap.style.setProperty("--p", progress.toFixed(3));
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      return () => window.removeEventListener("scroll", onScroll);
    }

    let progs;
    try {
      progs = {
        blur: compile(gl, VERT, BLUR),
        vel: compile(gl, VERT, VEL),
        render: compile(gl, VERT, RENDER),
      };
    } catch (e) {
      console.warn("[ink] falling back to SVG", e);
      return;
    }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const maskCanvas = document.createElement("canvas");
    const maskTex = gl.createTexture()!;
    let field: Target, fieldTmp: Target, velA: Target, velB: Target;
    let W = 0, H = 0;

    const pass = (prog: { p: WebGLProgram }, out: Target | null) => {
      gl.useProgram(prog.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
      gl.viewport(0, 0, out ? out.w : W, out ? out.h : H);
    };
    const bindTex = (unit: number, tex: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    };

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.round(canvas.clientWidth * dpr);
      H = Math.round(canvas.clientHeight * dpr);
      canvas.width = W;
      canvas.height = H;
      const fw = Math.round(W / 2), fh = Math.round(H / 2);
      const box = drawMask(maskCanvas, fw, fh);

      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      field = target(gl, fw, fh, false);
      fieldTmp = target(gl, fw, fh, false);
      const vw = Math.max(64, Math.round(fw / 3)), vh = Math.max(64, Math.round(fh / 3));
      velA = target(gl, vw, vh, true);
      velB = target(gl, vw, vh, true);

      // Blur the mask into the soft field (radius scales with the letter).
      const step = (box.s * 0.075) / 12;
      pass(progs.blur, fieldTmp);
      bindTex(0, maskTex);
      gl.uniform1i(progs.blur.loc.u_src, 0);
      gl.uniform2f(progs.blur.loc.u_step, step / fw, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      pass(progs.blur, field);
      bindTex(0, fieldTmp.tex);
      gl.uniform2f(progs.blur.loc.u_step, 0, step / fh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    build();

    // Pointer, in uv space (origin bottom-left).
    const mouse = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, moved: false };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width;
      mouse.y = 1 - (e.clientY - r.top) / r.height;
      if (!mouse.moved) { mouse.px = mouse.x; mouse.py = mouse.y; mouse.moved = true; }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", readScroll, { passive: true });

    let resizeT = 0;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = window.setTimeout(() => { build(); readScroll(); }, 120);
    };
    window.addEventListener("resize", onResize);

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(wrap);

    let raf = 0;
    const t0 = performance.now();
    let first = true;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      shown += (progress - shown) * 0.14;
      wrap.style.setProperty("--p", shown.toFixed(3));
      const aspect = W / H;

      // 1. displacement field
      const dx = mouse.x - mouse.px, dy = mouse.y - mouse.py;
      mouse.px = mouse.x; mouse.py = mouse.y;
      pass(progs.vel, velB);
      bindTex(0, velA.tex);
      gl.uniform1i(progs.vel.loc.u_vel, 0);
      gl.uniform2f(progs.vel.loc.u_texel, 1 / velA.w, 1 / velA.h);
      gl.uniform2f(progs.vel.loc.u_mouse, mouse.x, mouse.y);
      gl.uniform2f(progs.vel.loc.u_dir, dx * 2.4, dy * 2.4);
      gl.uniform1f(progs.vel.loc.u_radius, 0.011);
      gl.uniform1f(progs.vel.loc.u_aspect, aspect);
      gl.uniform1f(progs.vel.loc.u_decay, 0.968);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      [velA, velB] = [velB, velA];

      // 2. ink
      pass(progs.render, null);
      bindTex(0, field.tex);
      bindTex(1, velA.tex);
      const L = progs.render.loc;
      gl.uniform1i(L.u_field, 0);
      gl.uniform1i(L.u_vel, 1);
      gl.uniform1f(L.u_p, Math.min(1, shown / 0.9));
      gl.uniform1f(L.u_t, reduced ? 0 : (performance.now() - t0) / 1000);
      gl.uniform1f(L.u_aspect, aspect);
      gl.uniform3fv(L.u_ink, INK);
      gl.uniform3fv(L.u_paper, PAPER);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (first) { first = false; setLive(true); }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section ref={wrapRef} className="ink-hero" aria-labelledby="hero-title">
      <div className="ink-stage">
        <canvas ref={canvasRef} className="ink-canvas" aria-hidden="true" />

        {/* Shown before WebGL starts, and kept when WebGL is not available. */}
        <svg
          className="ink-fallback"
          data-hidden={live}
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <defs>
            <filter id="k-goo">
              <feGaussianBlur stdDeviation="3.2" />
              <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -13" />
            </filter>
          </defs>
          <g filter="url(#k-goo)" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {K_STROKES.map((k) => (
              <path key={k.d} d={k.d} strokeWidth={k.w} />
            ))}
          </g>
        </svg>
        <div ref={floodRef} className="ink-flood" aria-hidden="true" />

        <h1 id="hero-title" className="sr-only">
          {site.name}, {site.role}
        </h1>
        <div className="hero-corner hero-corner--tl" data-enter>
          {site.name}
        </div>
        <div className="hero-corner hero-corner--tr" data-enter>
          {site.role}
        </div>
        <div className="hero-corner hero-corner--bl" data-enter>
          Based in {site.location}
        </div>
        <a href="#work" className="hero-corner hero-corner--br" data-enter>
          Scroll down
        </a>
      </div>
    </section>
  );
}
