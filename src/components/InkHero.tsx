"use client";

import { useEffect, useRef, useState } from "react";
import { K_PARTS, drawK, kBox } from "@/lib/kMark";
import { floodOrigin, snap } from "@/lib/stage";
import { site } from "@/content/site";

/*
 * The landing screen: a soft ink "K" on paper that behaves like liquid.
 * - The pointer stirs a real fluid; the ink flows with it, swirls, then eases back into the K.
 * - Scrolling floods the screen with ink, which hands over to the dark project list.
 *
 * Pipeline (WebGL2, half-float targets):
 *   1. The K is drawn into a 2D mask and blurred on the GPU into a soft "home" field.
 *   2. A small stable-fluids solver (splat → curl/vorticity → divergence → pressure →
 *      projection → advection) moves a velocity field.
 *   3. An ink "dye" field is carried by that velocity and relaxed back toward home,
 *      so the letter smears like ink and slowly re-forms.
 *   4. The final pass thresholds the dye (plus the scroll flood term) into ink or paper.
 */

const PAPER: [number, number, number] = [0.949, 0.937, 0.914];
const INK: [number, number, number] = [0.055, 0.055, 0.055];

/** Cursor reach (size of the stirred area, in screen-height² units) and push strength. */
const STIR_RADIUS = 0.0003;
const STIR_FORCE = 1.1;

/**
 * Scroll timeline, as fractions of one screen of scroll:
 *   0 → FLOOD_END      ink floods out of the K and covers the screen
 *   DRAIN_START → DRAIN_END  the ink drains away from the centre, revealing the light
 *                       grid page (the project names then crawl in; see ProjectList)
 */
const FLOOD_END = 0.35;
const DRAIN_START = 0.38;
const DRAIN_END = 0.62;

/** Intro: seconds for the liquid to fill the K on the first visit. */
const FILL_S = 2.8;

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
`;

const BLUR = HEAD + `
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

const COPY = HEAD + `
uniform sampler2D u_src;
void main(){ o = texture(u_src, v_uv); }`;

const SPLAT = HEAD + `
uniform sampler2D u_target; uniform vec2 u_point; uniform vec2 u_force;
uniform float u_radius; uniform float u_aspect;
void main(){
  vec2 d = v_uv - u_point; d.x *= u_aspect;
  vec2 v = texture(u_target, v_uv).xy + u_force * exp(-dot(d, d) / u_radius);
  o = vec4(v, 0.0, 1.0);
}`;

const CURL = HEAD + `
uniform sampler2D u_vel; uniform vec2 u_texel;
void main(){
  float L = texture(u_vel, v_uv - vec2(u_texel.x, 0.0)).y;
  float R = texture(u_vel, v_uv + vec2(u_texel.x, 0.0)).y;
  float B = texture(u_vel, v_uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_vel, v_uv + vec2(0.0, u_texel.y)).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORTICITY = HEAD + `
uniform sampler2D u_vel; uniform sampler2D u_curl; uniform vec2 u_texel;
uniform float u_strength; uniform float u_dt;
void main(){
  float L = texture(u_curl, v_uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_curl, v_uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_curl, v_uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_curl, v_uv + vec2(0.0, u_texel.y)).x;
  float C = texture(u_curl, v_uv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4;
  f *= u_strength * C;
  f.y *= -1.0;
  vec2 v = texture(u_vel, v_uv).xy + f * u_dt;
  o = vec4(clamp(v, -2.0, 2.0), 0.0, 1.0);
}`;

const DIVERGENCE = HEAD + `
uniform sampler2D u_vel; uniform vec2 u_texel;
void main(){
  float L = texture(u_vel, v_uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_vel, v_uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_vel, v_uv - vec2(0.0, u_texel.y)).y;
  float T = texture(u_vel, v_uv + vec2(0.0, u_texel.y)).y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const PRESSURE = HEAD + `
uniform sampler2D u_pressure; uniform sampler2D u_div; uniform vec2 u_texel;
void main(){
  float L = texture(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;
  float d = texture(u_div, v_uv).x;
  o = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = HEAD + `
uniform sampler2D u_pressure; uniform sampler2D u_vel; uniform vec2 u_texel;
void main(){
  float L = texture(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;
  vec2 v = texture(u_vel, v_uv).xy - vec2(R - L, T - B);
  o = vec4(v, 0.0, 1.0);
}`;

/* Advect a field by the velocity. For the ink, also pull it back toward the K (u_relax). */
const ADVECT = HEAD + `
uniform sampler2D u_vel; uniform sampler2D u_src; uniform sampler2D u_home;
uniform float u_dt; uniform float u_keep; uniform float u_relax;
void main(){
  vec2 back = v_uv - u_dt * texture(u_vel, v_uv).xy;
  vec4 a = texture(u_src, back) * u_keep;
  o = mix(a, texture(u_home, v_uv), u_relax);
}`;

const RENDER = HEAD + `
uniform sampler2D u_dye; uniform vec2 u_dyeTexel;
uniform float u_p; uniform float u_q; uniform float u_t; uniform float u_aspect;
uniform float u_fill;  // intro: how full the K is (0..1); 1 after the intro
uniform sampler2D u_grid; // the 12-column grid with numbers (alpha = line)
#define TV_CURVE 0.11
uniform vec4 u_kbox;   // the K's box in uv: x0, yBottom, x1, yTop
uniform vec2 u_origin; // where the flood starts (uv): the centre, or the arcade's screen
uniform float u_clear; // 1: no K and no paper: the page under shows until the ink comes
uniform float u_jelly;  // intro: soft wobble of the whole K (1 while filling, eases to 0)
uniform float u_jiggle; // intro: squash-and-stretch bounce when it becomes full
uniform vec3 u_ink; uniform vec3 u_paper;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
// A small soft blur of the ink, so the edge stays round while it flows.
float dyeAt(vec2 uv){
  vec2 t = u_dyeTexel * 3.5;
  float s = texture(u_dye, uv).r * 4.0;
  s += texture(u_dye, uv + vec2(t.x, 0.0)).r + texture(u_dye, uv - vec2(t.x, 0.0)).r;
  s += texture(u_dye, uv + vec2(0.0, t.y)).r + texture(u_dye, uv - vec2(0.0, t.y)).r;
  s += 0.5 * (texture(u_dye, uv + t).r + texture(u_dye, uv - t).r + texture(u_dye, uv + vec2(t.x, -t.y)).r + texture(u_dye, uv + vec2(-t.x, t.y)).r);
  return s / 10.0;
}
void main(){
  // Curved old-TV glass: the middle bulges toward you (same look as the project pages).
  // Like a big CRT: the picture is pushed outward more at the corners, so its edges bow
  // out and the corners round off into the dark bezel.
  vec2 tq = (v_uv * 2.0 - 1.0) * vec2(u_aspect, 1.0);
  vec2 nq = v_uv * 2.0 - 1.0;
  float r2 = dot(nq, nq);
  vec2 cq = tq * (1.0 + TV_CURVE * r2) / (1.0 + TV_CURVE * 0.97);
  vec2 cuv = cq * vec2(1.0 / u_aspect, 1.0) * 0.5 + 0.5;
  vec2 se = abs(cuv - 0.5) * 2.0;
  float screenM = 1.0 - smoothstep(0.975, 1.0, pow(pow(se.x, 7.0) + pow(se.y, 7.0), 1.0 / 7.0));
  // TV glitches on curved lines: slow wobble, random tear bands, a rolling tracking band
  float line = floor(cuv.y * 360.0);
  float tear = step(0.987, hash(vec2(floor(cuv.y * 60.0), floor(u_t * 12.0))));
  float roll = fract(u_t * 0.07);
  float rb = exp(-pow((cuv.y - (1.1 - roll * 1.2)) / 0.025, 2.0));
  cuv.x += (noise(vec2(line * 0.15, u_t * 4.0)) - 0.5) * 0.003
         + tear * (hash(vec2(floor(cuv.y * 60.0), floor(u_t * 24.0) + 7.0)) - 0.5) * 0.06
         + rb * (noise(vec2(line * 0.6, u_t * 20.0)) - 0.5) * 0.02;
  vec2 uv = cuv;
  vec2 q = vec2(uv.x * u_aspect, uv.y);
  vec2 w = vec2(fbm(q * 2.2 + u_t * 0.04), fbm(q * 2.2 + 9.1 - u_t * 0.04)) - 0.5;
  // Jelly: while it fills the K wobbles softly; when full it gives a short squash-and-stretch.
  vec2 kc = vec2((u_kbox.x + u_kbox.z) * 0.5, (u_kbox.y + u_kbox.w) * 0.5);
  vec2 rel = uv - kc;
  float sq = sin(u_t * 9.0) * 0.035 * u_jiggle;
  rel *= vec2(1.0 + sq, 1.0 - sq);
  vec2 wob = vec2(sin(uv.y * 11.0 + u_t * 3.3), sin(uv.x * u_aspect * 9.0 - u_t * 2.7)) * 0.0055 * u_jelly;
  vec2 juv = kc + rel + wob;
  float f = dyeAt(juv + w * (0.004 + u_p * 0.09));
  // The flood front grows out from the letter (centre + the ink itself), with ragged noise edges.
  float n = fbm(q * 3.4 + w * 2.0 + vec2(3.7, u_t * 0.015));
  vec2 c = vec2(u_origin.x * u_aspect, u_origin.y);
  float d = length(q - c) / length(vec2(0.5 * u_aspect, 0.5));
  float front = pow(u_p, 1.6) * 1.5 - d + f * 0.25 - 0.06 + (n - 0.5) * 0.5 * smoothstep(0.0, 0.25, u_p);
  float lvF = 0.5 + front * 2.5;
  float aa = fwidth(f) + 0.0015;
  float aaF = fwidth(lvF) + 0.0015;
  float inkK = smoothstep(0.5 - aa, 0.5 + aa, f);
  // Intro: liquid fills the K from the bottom up, with a moving, wavy surface, while a
  // thin stream pours in from the top of the screen.
  if (u_fill < 1.0) {
    float level = mix(u_kbox.y, u_kbox.w, u_fill);
    float calm = 1.0 - u_fill;
    float x = uv.x * u_aspect;
    float kx0 = u_kbox.x * u_aspect, kw = (u_kbox.z - u_kbox.x) * u_aspect;
    float kmid = kx0 + kw * 0.5;
    // The K simply fills up from the bottom. Surface: it sloshes gently (the level tilts
    // side to side) with a soft swell on top.
    float surf = level
      + (x - kmid) * 0.09 * sin(u_t * 1.8) * calm
      + (0.005 * sin(x * 31.0 + u_t * 4.2) + 0.003 * sin(x * 57.0 - u_t * 6.1)) * calm;

    float below = 1.0 - smoothstep(surf - 0.0015, surf + 0.0015, juv.y);
    inkK = inkK * below;
  }
  float inkF = smoothstep(0.5 - aaF, 0.5 + aaF, lvF);
  inkF *= smoothstep(0.0, 0.05, u_p); // no flood until the page scrolls
  float ink = max(inkK, inkF);
  // The drain: a ragged paper hole opens from the centre and eats all the ink, K included.
  float n2 = fbm(q * 3.1 + w * 2.0 + vec2(11.3, -u_t * 0.015));
  float back = pow(u_q, 1.6) * 1.5 - d - 0.02 + (n2 - 0.5) * 0.5 * smoothstep(0.0, 0.25, u_q);
  float lv2 = 0.5 + back * 2.5;
  float aa2 = fwidth(lv2) + 0.0015;
  ink *= 1.0 - smoothstep(0.5 - aa2, 0.5 + aa2, lv2);
  // paper with the grid (and its numbers) drawn on the curved glass, then the ink
  float grid = texture(u_grid, vec2(cuv.x, 1.0 - cuv.y)).a * screenM * (1.0 - u_clear); // no stretched lines past the edge
  vec3 col = mix(mix(u_paper, u_ink, grid * 0.9), u_ink, ink);
  // scanlines, grain, a soft vignette and the tracking band's glow
  col *= 1.0 - 0.035 * step(0.5, fract(gl_FragCoord.y / 3.0)); // pixel-aligned: no moiré
  col += (hash(v_uv * vec2(1920.0, 1080.0) + u_t) - 0.5) * 0.05;
  col += rb * 0.02;
  col *= 0.9 + 0.1 * smoothstep(1.75, 0.5, length(tq / vec2(u_aspect * 0.9, 1.0))); // very light vignette, no dark edges
  // once the ink drains away, the page under this one (the showcase) shows through
  float a = mix(mix(1.0, ink, step(0.001, u_q)), ink, u_clear); // ink reaches the corners too: no frame
  o = vec4(col, a);
}`;

type Prog = { p: WebGLProgram; loc: Record<string, WebGLUniformLocation | null> };

function compile(gl: WebGL2RenderingContext, fs: string): Prog {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, VERT));
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
type Pair = { read: Target; write: Target; swap: () => void };

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

function pair(gl: WebGL2RenderingContext, w: number, h: number): Pair {
  const p: Pair = {
    read: target(gl, w, h, true),
    write: target(gl, w, h, true),
    swap: () => { [p.read, p.write] = [p.write, p.read]; },
  };
  return p;
}

function drawMask(c: HTMLCanvasElement, w: number, h: number, withK = true) {
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const b = kBox(w, h);
  ctx.setTransform(b.s / 100, 0, 0, b.s / 100, b.x, b.y);
  if (withK) drawK(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return b;
}

/**
 * `arcade`: the home page's version. No K: the page is clear at first so the arcade under it
 * shows, and the ink floods out of the arcade's screen (`floodOrigin`), then drains.
 */
export default function InkHero({ arcade = false }: { arcade?: boolean }) {
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
      const span = window.innerHeight; // progress = screens scrolled (0..1)
      progress = Math.min(1, Math.max(0, -r.top / span));
    };
    readScroll();

    // No WebGL2 (or no half-float targets): the SVG K stays, and a plain fade carries the flood.
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: arcade });
    const halfOk = !!gl && !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    if (!gl || !halfOk) {
      wrap.dataset.intro = "done";
      wrap.dataset.fallback = "true";
      const onScroll = () => {
        readScroll();
        const fin = Math.min(1, progress / FLOOD_END);
        const fout = Math.min(1, Math.max(0, (progress - DRAIN_START) / (DRAIN_END - DRAIN_START)));
        if (floodRef.current) floodRef.current.style.opacity = String(fin * (1 - fout));
        wrap.style.setProperty("--p", progress.toFixed(3));
        wrap.dataset.corners = progress < 0.05 ? "on" : "off";
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      const late = window.setTimeout(onScroll, 200); // after a page switch sets the scroll
      return () => { window.clearTimeout(late); window.removeEventListener("scroll", onScroll); };
    }

    let P: Record<string, Prog>;
    try {
      P = {
        blur: compile(gl, BLUR),
        copy: compile(gl, COPY),
        splat: compile(gl, SPLAT),
        curl: compile(gl, CURL),
        vorticity: compile(gl, VORTICITY),
        divergence: compile(gl, DIVERGENCE),
        pressure: compile(gl, PRESSURE),
        gradient: compile(gl, GRADIENT),
        advect: compile(gl, ADVECT),
        render: compile(gl, RENDER),
      };
    } catch (e) {
      console.warn("[ink] falling back to SVG", e);
      wrap.dataset.intro = "done";
      wrap.dataset.fallback = "true";
      wrap.dataset.corners = "on";
      return;
    }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const gridTex = gl.createTexture()!;
    const maskCanvas = document.createElement("canvas");
    const maskTex = gl.createTexture()!;
    let W = 0, H = 0;
    let kbox = [0, 0, 1, 1];
    let home: Target, homeTmp: Target, dye: Pair, vel: Pair, pressure: Pair, div: Target, curl: Target;

    const run = (prog: Prog, out: Target | null, uniforms: Record<string, number | number[] | WebGLTexture>) => {
      gl.useProgram(prog.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
      gl.viewport(0, 0, out ? out.w : W, out ? out.h : H);
      let unit = 0;
      for (const [k, v] of Object.entries(uniforms)) {
        const l = prog.loc[k];
        if (l === undefined || l === null) continue;
        if (v instanceof WebGLTexture) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, v);
          gl.uniform1i(l, unit++);
        } else if (Array.isArray(v)) {
          if (v.length === 2) gl.uniform2fv(l, v);
          else if (v.length === 3) gl.uniform3fv(l, v);
          else gl.uniform4fv(l, v);
        } else gl.uniform1f(l, v);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.round(canvas.clientWidth * dpr);
      H = Math.round(canvas.clientHeight * dpr);
      // The grid (same layout as the project pages' CSS grid), drawn once into a texture so
      // the shader can bend it with the TV curve.
      {
        const cw = canvas.clientWidth, ch = canvas.clientHeight;
        const gc = document.createElement("canvas");
        gc.width = W; gc.height = H;
        const gx = gc.getContext("2d")!;
        gx.scale(dpr, dpr);
        const gut = Math.min(32, Math.max(16, cw * 0.022));
        const colW = (cw - 2 * gut) / 12, rowH = colW * (cw < 760 ? 1.6 * 3 : 2.4), row0 = gut + 40;
        gx.fillStyle = "rgba(0,0,0,0.11)";
        for (let i = 0; i <= 12; i++) gx.fillRect(Math.round(gut + i * colW), 0, 1, ch);
        gx.font = "10px ui-monospace, Menlo, monospace";
        for (let r = 0, y = row0; y < ch; r++, y = row0 + r * rowH) {
          gx.fillStyle = "rgba(0,0,0,0.11)";
          gx.fillRect(gut, Math.round(y), cw - 2 * gut, 1);
          gx.fillStyle = "rgba(0,0,0,0.34)";
          for (let i = 0; i < 12; i++) gx.fillText(String(i + 1).padStart(2, "0"), gut + i * colW + 8, y + 18);
        }
        gl.bindTexture(gl.TEXTURE_2D, gridTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gc);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      canvas.width = W;
      canvas.height = H;
      const fw = Math.round(W / 2), fh = Math.round(H / 2);
      const box = drawMask(maskCanvas, fw, fh, !arcade);
      // The K's own extent (it fills 6..94 of its 100-unit box), in uv (y up).
      kbox = [box.x / fw, 1 - (box.y + box.s * 0.94) / fh, (box.x + box.s) / fw, 1 - (box.y + box.s * 0.06) / fh];

      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      home = target(gl, fw, fh, false);
      homeTmp = target(gl, fw, fh, false);
      dye = pair(gl, fw, fh);
      // Velocity grid: ~1/6 of the canvas; fine enough for a small cursor, still smooth.
      const sw = Math.max(64, Math.round(W / 6)), sh = Math.max(64, Math.round(H / 6));
      vel = pair(gl, sw, sh);
      pressure = pair(gl, sw, sh);
      div = target(gl, sw, sh, true);
      curl = target(gl, sw, sh, true);

      // Blur the mask into the soft home field (radius scales with the letter).
      const step = (box.s * 0.075) / 12;
      run(P.blur, homeTmp, { u_src: maskTex, u_step: [step / fw, 0] });
      run(P.blur, home, { u_src: homeTmp.tex, u_step: [0, step / fh] });
      // The ink starts exactly on the letter.
      run(P.copy, dye.write, { u_src: home.tex });
      dye.swap();
    };
    build();

    // Pointer, in uv space (origin bottom-left).
    const mouse = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, moved: false, fresh: false };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width;
      mouse.y = 1 - (e.clientY - r.top) / r.height;
      if (!mouse.moved) { mouse.px = mouse.x; mouse.py = mouse.y; mouse.moved = true; }
      mouse.fresh = true;
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

    // Intro: once per visit, from the top of the page, unless motion is reduced. The fill
    // waits at 90% until the page has fully loaded, so it doubles as the loading screen.
    let playIntro = !arcade && !reduced && window.scrollY < 10 && window.location.hash !== "#work";
    try { if (sessionStorage.getItem("kfolio:intro")) playIntro = false; } catch {}
    wrap.dataset.intro = playIntro ? "playing" : "done";
    let introT = playIntro ? 0 : 1;
    let jelly = 0, jiggle = 0, filledAt = 0;
    let introFill = playIntro ? 0 : 1;
    let loaded = document.readyState === "complete";
    const onLoad = () => { loaded = true; };
    window.addEventListener("load", onLoad);
    const finishIntro = () => {
      wrap.dataset.intro = "done";
      try { sessionStorage.setItem("kfolio:intro", "1"); } catch {}
    };

    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    let first = true;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) { last = now; return; }
      // The first rAF timestamp can be earlier than when we started; never step backwards.
      const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 30));
      last = now;
      if (introT < 1) {
        introT = Math.min(loaded ? 1 : 0.9, introT + dt / FILL_S);
        introFill = introT < 0.5 ? 2 * introT * introT : 1 - Math.pow(-2 * introT + 2, 2) / 2;
        if (introT >= 1) { introFill = 1; finishIntro(); filledAt = now; }
      }
      // jelly wobble while filling, easing away after; a short bounce the moment it's full
      jelly = introT < 1 ? 1 : filledAt ? Math.exp(-(now - filledAt) / 900) : 0;
      jiggle = filledAt ? Math.exp(-(now - filledAt) / 450) : 0;
      // Ease toward the scroll position by real time, so slow devices still finish the flood.
      // For the first half second, jump straight there (landing mid-page shows no flash).
      if (now - t0 < 500 || now < snap.until) { readScroll(); shown = progress; }
      else shown += (progress - shown) * (1 - Math.pow(1 - 0.14, dt * 60));
      wrap.style.setProperty("--p", shown.toFixed(3));
      const drained = shown > DRAIN_END - 0.05 ? "1" : "0";
      if (wrap.dataset.drained !== drained) wrap.dataset.drained = drained;
      // corner text: on once the K is full and we're at the top; off once the flood starts
      const corners = introT >= 1 && shown < 0.05 ? "on" : "off";
      if (wrap.dataset.corners !== corners) wrap.dataset.corners = corners;
      const aspect = W / H;
      const texel = [1 / vel.read.w, 1 / vel.read.h];

      // 1. stir: push the fluid along the pointer's path.
      //    STIR_RADIUS = how wide the cursor's reach is; STIR_FORCE = how hard it pushes.
      if (mouse.fresh && !reduced) {
        const dx = mouse.x - mouse.px, dy = mouse.y - mouse.py;
        if (dx * dx + dy * dy > 1e-8) {
          const k = 1 / Math.max(dt, 1 / 120);
          run(P.splat, vel.write, {
            u_target: vel.read.tex, u_point: [mouse.x, mouse.y], u_force: [dx * k * STIR_FORCE, dy * k * STIR_FORCE],
            u_radius: STIR_RADIUS, u_aspect: aspect,
          });
          vel.swap();
        }
        mouse.px = mouse.x; mouse.py = mouse.y; mouse.fresh = false;
      }

      // 2. swirl a little, then make the flow incompressible
      run(P.curl, curl, { u_vel: vel.read.tex, u_texel: texel });
      run(P.vorticity, vel.write, { u_vel: vel.read.tex, u_curl: curl.tex, u_texel: texel, u_strength: 2, u_dt: dt });
      vel.swap();
      run(P.divergence, div, { u_vel: vel.read.tex, u_texel: texel });
      for (let i = 0; i < 20; i++) {
        run(P.pressure, pressure.write, { u_pressure: pressure.read.tex, u_div: div.tex, u_texel: texel });
        pressure.swap();
      }
      run(P.gradient, vel.write, { u_pressure: pressure.read.tex, u_vel: vel.read.tex, u_texel: texel });
      vel.swap();

      // 3. carry velocity and ink; the ink drifts back home to the K
      run(P.advect, vel.write, { u_vel: vel.read.tex, u_src: vel.read.tex, u_home: vel.read.tex, u_dt: dt, u_keep: Math.pow(0.965, dt * 60), u_relax: 0 });
      vel.swap();
      run(P.advect, dye.write, { u_vel: vel.read.tex, u_src: dye.read.tex, u_home: home.tex, u_dt: dt, u_keep: 1, u_relax: 1 - Math.pow(1 - 0.03, dt * 60) });
      dye.swap();

      // 4. ink on paper
      run(P.render, null, {
        u_grid: gridTex,
        u_dye: dye.read.tex,
        u_dyeTexel: [1 / dye.read.w, 1 / dye.read.h],
        u_p: Math.min(1, shown / FLOOD_END),
        u_q: Math.min(1, Math.max(0, (shown - DRAIN_START) / (DRAIN_END - DRAIN_START))),
        u_fill: introFill,
        u_kbox: kbox,
        u_origin: arcade ? [floodOrigin.x, floodOrigin.y] : [0.5, 0.5],
        u_clear: arcade ? 1 : 0,
        u_jelly: jelly,
        u_jiggle: jiggle,
        u_t: reduced ? 0 : (now - t0) / 1000,
        u_aspect: aspect,
        u_ink: INK,
        u_paper: PAPER,
      });

      if (first) { first = false; setLive(true); }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("load", onLoad);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [arcade]);

  return (
    <section ref={wrapRef} id="top" className="ink-hero" data-intro="pending" data-arcade={arcade || undefined} aria-labelledby="hero-title">
      {/* Without JavaScript there is no intro: show the K and the corner text. */}
      <noscript>
        <style>{".ink-hero .ink-fallback{visibility:visible!important}.ink-hero .hero-corner{opacity:1!important;translate:0 0!important}"}</style>
      </noscript>
      <div className="ink-stage">
        <canvas ref={canvasRef} className="ink-canvas" aria-hidden="true" />

        {/* Shown before WebGL starts, and kept when WebGL is not available. */}
        {!arcade && <svg className="ink-fallback" data-hidden={live} viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <filter id="k-goo">
              <feGaussianBlur stdDeviation="3.2" />
              <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -13" />
            </filter>
            <mask id="k-cuts">
              <rect width="100" height="100" fill="#fff" />
              {K_PARTS.filter((p) => p.kind === "cut").map((p) => (
                <path key={p.d} d={p.d} fill="#000" />
              ))}
            </mask>
          </defs>
          <g filter="url(#k-goo)">
            <g mask="url(#k-cuts)" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              {K_PARTS.map((p) =>
                p.kind === "fill" ? (
                  <path key={p.d} d={p.d} stroke="none" />
                ) : p.kind === "stroke" ? (
                  <path key={p.d} d={p.d} fill="none" strokeWidth={p.w} />
                ) : null,
              )}
            </g>
          </g>
        </svg>}
        <div ref={floodRef} className="ink-flood" aria-hidden="true" />


        <h1 id="hero-title" className="sr-only">
          {site.name}, {site.role}
        </h1>
        <div className="hero-corner hero-corner--tl">
          {site.name}
        </div>
        <div className="hero-corner hero-corner--tr">
          {site.role}
        </div>
        <div className="hero-corner hero-corner--bl">
          Based in {site.location}
        </div>
        <a href="#work" className="hero-corner hero-corner--br">
          Scroll down
        </a>
      </div>
    </section>
  );
}
