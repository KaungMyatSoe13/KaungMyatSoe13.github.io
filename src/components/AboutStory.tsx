"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { aboutIntro, afterHours, contact, experience, skills, type HobbyShape, type SkillIcon } from "@/content/about";
import ContactTv, { type TvScreen } from "./ContactTv";
import { site } from "@/content/site";
import KLogo from "./KLogo";
import TvLink from "./TvLink";
import { tvOn } from "@/lib/tv";

/*
 * About page (inspired by inacionakiti.com, not a copy):
 *   1. About me: text on the left, the photo rebuilt from particles on the right. The
 *      particles gather in on load, drift a little, and move away from the pointer.
 *   2. Experience: a timeline on the right; on the left, the year of the entry in view,
 *      drawn in particles. When the year changes, the particles swirl loose and re-form
 *      into the new digits.
 * Both are plain WebGL2 points.
 */

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function gl2(canvas: HTMLCanvasElement) {
  return canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
}
function program(gl: WebGL2RenderingContext, vs: string, fs: string, attrs: string[]) {
  const sh = (t: number, s: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? ""); return x; };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  return { p, U: (n: string) => gl.getUniformLocation(p, n) };
}
function buffer(gl: WebGL2RenderingContext, loc: number, data: Float32Array, size: number, usage: number = gl.STATIC_DRAW) {
  const b = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  return b;
}
const DOT_FS = `#version 300 es
precision mediump float;
in float v_l; in float v_a; out vec4 o;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  o = vec4(vec3(v_l), v_a * (1.0 - d * 0.5));
}`;


/* The landing's TV glitch, on curved lines: a faint per-line wobble, random tear bands and a
   tracking band that rolls down every ~14 s, pushing lines sideways as it passes. ty = 0 at
   the top of the (curved) screen; returns the sideways shift in 0..1 screen widths and the
   band's strength. Every canvas uses the same clock (u_clk), so they glitch together. */
const GLITCH = `
float g_hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float g_vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(g_hsh(i), g_hsh(i + vec2(1, 0)), f.x), mix(g_hsh(i + vec2(0, 1)), g_hsh(i + vec2(1, 1)), f.x), f.y); }
float glitchX(float ty, float t, out float rb){
  float line = floor(ty * 360.0);
  float tear = step(0.987, g_hsh(vec2(floor(ty * 60.0), floor(t * 12.0))));
  rb = exp(-pow((ty - (-0.1 + fract(t * 0.07) * 1.2)) / 0.025, 2.0));
  return (g_vn(vec2(line * 0.15, t * 4.0)) - 0.5) * 0.003
       + tear * (g_hsh(vec2(floor(ty * 60.0), floor(t * 24.0) + 7.0)) - 0.5) * 0.06
       + rb * (g_vn(vec2(line * 0.6, t * 20.0)) - 0.5) * 0.02;
}`;
/** One clock for every canvas's glitch (seconds, wrapped to keep float precision). */
const clk = () => (performance.now() / 1000) % 3600;

/* Curved old-TV glass + random tear bands, measured on the whole viewport (u_rect = this
   canvas's box in viewport fractions), so every canvas on the page bends the same way. */
const CRT = `
uniform vec4 u_rect; uniform float u_vaspect; uniform vec2 u_turn; uniform float u_clk;
${GLITCH}
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 crt(vec2 local, float t){
  vec2 v = vec2(u_rect.x + (local.x * 0.5 + 0.5) * u_rect.z, u_rect.y + (0.5 - local.y * 0.5) * u_rect.w);
  vec2 n = v * 2.0 - 1.0;
  n += u_turn;                                      // same shift as the text (clip units)
  float r2 = dot(n, n);
  n *= (1.0 + 0.11 * 0.97) / (1.0 + 0.11 * r2);     // same TV curve as the landing
  float rb;
  n.x += glitchX(n.y * 0.5 + 0.5, u_clk, rb) * 2.0;
  v = n * 0.5 + 0.5;
  return vec2(((v.x - u_rect.x) / u_rect.z) * 2.0 - 1.0, 1.0 - ((v.y - u_rect.y) / u_rect.w) * 2.0);
}`;
/** The pointer, eased, shared by every canvas and the text (like the project page). */
const turn = { x: 0, y: 0, tx: 0, ty: 0 };
/** The text moves -14px × x and +8px × y (down) with the pointer; particles move the same, in clip units. */
const turnClip = (): [number, number] => [(-turn.x * 14 * 2) / innerWidth, (-turn.y * 8 * 2) / innerHeight];

function rectOf(canvas: HTMLCanvasElement): [number, number, number, number] {
  const r = canvas.getBoundingClientRect();
  return [r.left / innerWidth, r.top / innerHeight, r.width / innerWidth, r.height / innerHeight];
}

/* ---------- 1. Portrait in particles ---------- */
const PORTRAIT_VS = `#version 300 es
in vec2 a_home; in float a_l; in vec3 a_seed;
in vec2 d0; in vec2 d1; in vec2 d2; in vec2 d3; in vec2 d4; in vec2 d5; in vec2 yr; in vec2 yr2; in vec3 o0; in vec3 o1; in vec3 o2; in vec3 o3; in vec2 fm;
uniform float w[11];  // 0 portrait, 1..6 "what I do" icons, 7 first year, 8 last year, 9 the hobby object, 10 the contact form
uniform float u_keep;            // share of particles shown (fewer on the way to the year)
uniform mat3 u_rot[4]; uniform float u_ow[4];  // hobby objects (ball, pad, record, chip): turn, mix
uniform float u_vs; uniform vec2 u_vc;            // their size and centre
uniform float u_fmy;                              // the form scrolls with the page
uniform float u_glitch;                           // slices jump while the form takes over
uniform float u_loose, u_fade;
uniform float u_t, u_gather, u_aspect, u_size, u_reveal, u_rad;
uniform vec2 u_mouse;
uniform sampler2D u_smear;
out float v_l; out float v_a;
${CRT}
void main(){
  // where this particle belongs right now: the photo, or a diagram, as you scroll
  // the hobby object: each 3D shape turned its own way, mixed by channel, in perspective
  vec3 ob = (u_rot[0] * o0) * u_ow[0] + (u_rot[1] * o1) * u_ow[1] + (u_rot[2] * o2) * u_ow[2] + (u_rot[3] * o3) * u_ow[3];
  vec2 rec = u_vc + ob.xy * u_vs * 3.0 / (3.0 - ob.z);
  float face = smoothstep(-0.7, 0.5, ob.z);                     // the far side reads dimmer
  vec2 home = a_home * w[0] + d0 * w[1] + d1 * w[2] + d2 * w[3] + d3 * w[4] + d4 * w[5] + d5 * w[6] + yr * w[7] + yr2 * w[8] + rec * w[9] + (fm + vec2(0.0, u_fmy)) * w[10];
  // swirl loose on the way between two shapes
  float sw = a_seed.x * 6.2831 + u_t * 0.5;
  home += vec2(cos(sw), sin(sw)) * u_loose * (0.06 + a_seed.y * 0.22);
  vec2 away = (a_seed.xy * 2.0 - 1.0) * vec2(u_aspect, 1.0) * 1.3;
  float a = clamp(u_gather * 1.6 - a_seed.z * 0.6, 0.0, 1.0);
  float e = a < 0.5 ? 4.0 * a * a * a : 1.0 - pow(-2.0 * a + 2.0, 3.0) / 2.0;
  vec2 p = mix(away, home, e);
  p += vec2(sin(u_t * 0.8 + a_seed.z * 40.0), cos(u_t * 0.7 + a_seed.x * 30.0)) * 0.003;
  // liquid: the pointer drags particles; they drift back slowly
  vec2 sm = textureLod(u_smear, vec2(p.x / u_aspect * 0.5 + 0.5, p.y * 0.5 + 0.5), 0.0).xy;
  // scatter: each particle is thrown its own amount and a little sideways
  vec2 side = vec2(-sm.y, sm.x) * (a_seed.y - 0.5) * 1.6;
  p += (sm * (0.5 + 1.3 * a_seed.x) + side) * vec2(u_aspect, 1.0);
  // hover: the particles part around the pointer and fade, revealing the photo underneath
  vec2 d = p - u_mouse;
  float dl = length(d);
  float k = exp(-dl * dl / (u_rad * u_rad));
  p += normalize(d + 1e-5) * 0.025 * k * u_reveal;
  // glitch: horizontal slices jump sideways
  p.x += (hsh(vec2(floor(p.y * 28.0), floor(u_t * 30.0))) - 0.5) * 0.16 * u_glitch * step(0.55, hsh(vec2(floor(p.y * 28.0), floor(u_t * 30.0) + 3.0)));
  vec2 q = crt(vec2(p.x / u_aspect, p.y), u_t);
  gl_Position = vec4(q, 0.0, 1.0);
  gl_PointSize = u_size;
  v_l = mix(mix(0.88, a_l, w[0]), 0.55 + 0.45 * face, w[9]);      // diagrams are evenly lit
  v_a = smoothstep(0.0, 0.3, a) * (1.0 - 0.95 * k * u_reveal) * u_fade;
  v_a *= 1.0 - smoothstep(u_keep - 0.03, u_keep, a_seed.z);  // thin out smoothly
  v_a *= mix(1.0, 0.3 + 0.7 * face, w[9]);
}`;

// the real photo, shown only inside a soft circle around the pointer
const PHOTO_VS = `#version 300 es
in vec2 a_pos; out vec2 v_uv; out vec2 v_p;
uniform vec4 u_box; uniform float u_aspect, u_t;
${CRT}
void main(){
  v_uv = a_pos;
  v_p = vec2(mix(u_box.x, u_box.z, a_pos.x), mix(u_box.w, u_box.y, a_pos.y));
  gl_Position = vec4(crt(vec2(v_p.x / u_aspect, v_p.y), u_t), 0.0, 1.0);
}`;
const PHOTO_FS = `#version 300 es
precision mediump float;
in vec2 v_uv; in vec2 v_p; out vec4 o;
uniform sampler2D u_img; uniform vec2 u_mouse; uniform float u_reveal, u_rad;
void main(){
  vec4 c = texture(u_img, v_uv);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float m = 1.0 - smoothstep(u_rad * 0.55, u_rad * 1.05, length(v_p - u_mouse));
  o = vec4(vec3(pow(l, 0.85) * 1.15), c.a * m * u_reveal);
}`;


/** Draw one step's icon in white on a 1000 x 720 canvas (chalky outlines and bars). */
function drawIcon(g: CanvasRenderingContext2D, icon: SkillIcon) {
  const W = 1000, H = 720;
  g.strokeStyle = g.fillStyle = "#fff"; g.lineCap = "round"; g.lineJoin = "round";
  const rr = (x: number, y: number, w: number, h: number, r: number, fill = false) => { g.beginPath(); g.roundRect(x, y, w, h, r); if (fill) g.fill(); else g.stroke(); };
  const bar = (x: number, y: number, w: number, h = 18) => rr(x, y, w, h, 4, true);
  const font = (px: number) => (g.font = `700 ${px}px "Inter Tight", system-ui, sans-serif`);
  g.textAlign = "center"; g.textBaseline = "middle";
  switch (icon) {
    case "discover": {
      // a magnifying glass over a few lines of notes
      g.lineWidth = 7;
      bar(180, 250, 300); bar(180, 300, 220); bar(180, 350, 260); bar(180, 400, 160);
      g.save(); g.globalCompositeOperation = "destination-out";
      g.beginPath(); g.arc(470, 320, 190, 0, Math.PI * 2); g.fill(); g.restore();
      g.lineWidth = 18; g.beginPath(); g.arc(470, 320, 175, 0, Math.PI * 2); g.stroke();
      bar(380, 260, 170, 22); bar(380, 315, 120, 22); bar(380, 370, 150, 22);
      g.lineWidth = 46; g.beginPath(); g.moveTo(600, 455); g.lineTo(760, 615); g.stroke();
      g.lineWidth = 8; g.beginPath(); g.arc(470, 320, 140, -2.6, -1.7); g.stroke(); // glint
      break;
    }
    case "design": {
      // a browser with a hero picture, a heading and two cards
      g.lineWidth = 6; rr(110, 70, 780, 580, 26);
      g.beginPath(); g.moveTo(110, 140); g.lineTo(890, 140); g.stroke();
      [150, 185, 220].forEach((x) => { g.beginPath(); g.arc(x, 105, 10, 0, Math.PI * 2); g.fill(); });
      g.lineWidth = 8; rr(160, 180, 400, 260, 18);
      g.beginPath(); g.moveTo(180, 420); g.lineTo(290, 300); g.lineTo(370, 380); g.lineTo(420, 330); g.lineTo(540, 420); g.stroke();
      g.beginPath(); g.arc(470, 240, 24, 0, Math.PI * 2); g.stroke();
      bar(600, 200, 240, 30); bar(600, 255, 180, 30); bar(600, 330, 220); bar(600, 365, 190); bar(600, 400, 150);
      rr(600, 450, 130, 40, 20); 
      [160, 420].forEach((x) => { g.lineWidth = 7; rr(x, 480, 230, 130, 16); bar(x + 25, 570, 120, 16); });
      break;
    }
    case "architect": {
      // a three-tier system: app → services → database
      font(36); g.lineWidth = 8;
      rr(370, 60, 260, 120, 18); g.fillText("App", 500, 122);
      rr(140, 290, 240, 110, 18); g.fillText("API", 260, 347);
      rr(620, 290, 240, 110, 18); g.fillText("Auth", 740, 347);
      g.lineWidth = 6;
      [[440, 180, 260, 290], [560, 180, 740, 290], [260, 400, 440, 520], [740, 400, 560, 520]].forEach(([x1, y1, x2, y2]) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); });
      g.lineWidth = 8;
      g.beginPath(); g.ellipse(500, 540, 150, 40, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(350, 540); g.lineTo(350, 640); g.ellipse(500, 640, 150, 40, 0, Math.PI, 0, true); g.lineTo(650, 540); g.stroke();
      g.beginPath(); g.ellipse(500, 590, 150, 40, 0, 0, Math.PI); g.stroke();
      break;
    }
    case "build": {
      // a code editor with indented lines and a big </>
      g.lineWidth = 6; rr(120, 80, 760, 560, 26);
      g.beginPath(); g.moveTo(120, 150); g.lineTo(880, 150); g.stroke();
      [160, 195, 230].forEach((x) => { g.beginPath(); g.arc(x, 115, 10, 0, Math.PI * 2); g.fill(); });
      const lines: [number, number][] = [[0, 220], [1, 300], [2, 180], [2, 240], [1, 140], [1, 260], [2, 200], [0, 120]];
      lines.forEach(([ind, w], k) => { bar(170, 190 + k * 48, 26, 16); bar(220 + ind * 48, 190 + k * 48, w, 16); });
      bar(220 + 48, 190 + 8 * 48, 10, 32); // cursor
      font(150); g.fillText("</>", 700, 420);
      break;
    }
    case "launch": {
      // a rocket rising out of an open box, with motion lines
      g.lineWidth = 12;
      g.beginPath(); g.moveTo(500, 90); g.bezierCurveTo(570, 150, 585, 260, 565, 360); g.lineTo(435, 360); g.bezierCurveTo(415, 260, 430, 150, 500, 90); g.stroke();
      g.beginPath(); g.moveTo(450, 175); g.lineTo(550, 175); g.stroke();
      g.beginPath(); g.arc(500, 240, 34, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(438, 300); g.quadraticCurveTo(380, 320, 375, 390); g.lineTo(440, 360); g.stroke();
      g.beginPath(); g.moveTo(562, 300); g.quadraticCurveTo(620, 320, 625, 390); g.lineTo(560, 360); g.stroke();
      g.beginPath(); g.moveTo(500, 300); g.lineTo(500, 345); g.stroke();
      [[395, 150, 395, 230], [605, 150, 605, 230]].forEach(([x1, y1, x2, y2]) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); });
      // the box: back flaps, front faces, front flaps
      g.lineJoin = "round";
      g.beginPath(); g.moveTo(330, 410); g.lineTo(500, 350); g.lineTo(670, 410); g.stroke();
      g.beginPath(); g.moveTo(330, 410); g.lineTo(330, 590); g.lineTo(500, 660); g.lineTo(670, 590); g.lineTo(670, 410); g.stroke();
      g.beginPath(); g.moveTo(500, 470); g.lineTo(500, 660); g.stroke();
      g.beginPath(); g.moveTo(330, 410); g.lineTo(500, 470); g.lineTo(670, 410); g.stroke();
      g.beginPath(); g.moveTo(330, 410); g.lineTo(260, 500); g.lineTo(430, 560); g.lineTo(500, 470); g.stroke();
      g.beginPath(); g.moveTo(670, 410); g.lineTo(740, 500); g.lineTo(570, 560); g.lineTo(500, 470); g.stroke();
      g.lineWidth = 10; g.beginPath(); g.moveTo(300, 498); g.lineTo(360, 518); g.stroke();
      g.beginPath(); g.moveTo(560, 690); g.lineTo(640, 662); g.stroke();
      break;
    }
    case "maintain": {
      // a gear with a check mark inside, like a "settings: all good" badge
      const cx = 500, cy = 360, R = 250, r0 = 200, teeth = 8;
      g.lineWidth = 16; g.beginPath();
      for (let k = 0; k < teeth; k++) {
        const base = (k / teeth) * Math.PI * 2, w = 0.2, gap = (Math.PI * 2) / teeth;
        const pts: [number, number][] = [
          [base - gap / 2 + 0.06, r0], [base - w, r0], [base - w * 0.8, R], [base + w * 0.8, R], [base + w, r0], [base + gap / 2 - 0.06, r0],
        ];
        pts.forEach(([a, rad], j) => { const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; if (k === 0 && j === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      }
      g.closePath(); g.stroke();
      g.lineWidth = 14;
      g.beginPath(); g.arc(cx, cy, 110, -0.75, Math.PI * 2 - 1.05); g.stroke();
      g.beginPath(); g.moveTo(cx - 60, cy); g.lineTo(cx - 10, cy + 50); g.lineTo(cx + 110, cy - 90); g.stroke();
      break;
    }
  }
  void W; void H;
}

/** Particle targets for one step: its icon drawn offscreen, sampled, placed on the right. */
function iconPoints(icon: SkillIcon, N: number, aspect: number) {
  const W = 1000, H = 720;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  drawIcon(g, icon);
  const d = g.getImageData(0, 0, W, H).data;
  const on: number[] = [];
  for (let k = 0; k < W * H; k++) if (d[k * 4 + 3] > 128) on.push(k);
  // right half on wide screens, lower middle on phones; units: x in ±aspect, y in ±1
  const wide = aspect > 1;
  const bw = wide ? Math.min(aspect * 0.8, 1.9) : aspect * 1.8, bh = bw * (H / W);
  const cx = wide ? aspect * 0.53 : 0, cy = wide ? 0.04 : -0.35;   // clear of the text on the left
  const out = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const k = on[Math.floor(Math.random() * on.length)] ?? 0;
    const px = (k % W) + Math.random(), py = Math.floor(k / W) + Math.random();
    out[i * 2] = cx + (px / W - 0.5) * bw;
    out[i * 2 + 1] = cy - (py / H - 0.5) * bh;
  }
  return out;
}

/* ---------- Liquid pointer: a slowly fading displacement field ---------- */
const SMEAR_VS = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const SMEAR_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_prev; uniform vec2 u_texel, u_mouse, u_vel; uniform float u_aspect, u_on, u_keep;
void main(){
  // fade and soften what's there, so pushed particles drift back slowly and smoothly
  vec2 v = texture(u_prev, v_uv).xy * 0.6
         + (texture(u_prev, v_uv + vec2(u_texel.x, 0.0)).xy + texture(u_prev, v_uv - vec2(u_texel.x, 0.0)).xy
          + texture(u_prev, v_uv + vec2(0.0, u_texel.y)).xy + texture(u_prev, v_uv - vec2(0.0, u_texel.y)).xy) * 0.1;
  v *= u_keep;
  // the pointer drags particles along its path and nudges them outward
  vec2 d = (v_uv - u_mouse) * vec2(u_aspect, 1.0);
  float g = exp(-dot(d, d) / 0.0028) * u_on;           // a smaller reach around the pointer
  float mv = min(1.0, length(u_vel) * 40.0);             // only while the pointer moves
  v += (u_vel * 0.9 + normalize(d + 1e-5) * 0.02 * mv) * g;  // thrown harder
  float l = length(v);
  if (l > 0.22) v *= 0.22 / l;
  o = vec4(v, 0.0, 1.0);
}`;

/** One per WebGL context. update() returns the field texture (x, y offsets in clip units). */
function makeSmear(gl: WebGL2RenderingContext) {
  const ok = !!gl.getExtension("EXT_color_buffer_float");
  const S = 128;
  const P = program(gl, SMEAR_VS, SMEAR_FS, ["a_pos"]);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  buffer(gl, 0, new Float32Array([-1, -1, 3, -1, -1, 3]), 2);
  const mk = () => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (ok) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, S, S, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer()!;
    if (ok) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    return { t, f };
  };
  let a = mk(), b = mk();
  let lx = -9, ly = -9;
  return {
    /** mouse in canvas uv (0..1, y up); keep = how much survives each frame */
    update(mx: number, my: number, aspect: number, dt: number) {
      if (!ok) return a.t;
      const on = mx > -1 && mx < 2 ? 1 : 0;
      const vx = lx > -1 ? (mx - lx) * 2 : 0, vy = ly > -1 ? (my - ly) * 2 : 0; // uv → clip units
      lx = on ? mx : -9; ly = on ? my : -9;
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.f);
      gl.viewport(0, 0, S, S);
      gl.disable(gl.BLEND);
      gl.useProgram(P.p); gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.t);
      gl.uniform1i(P.U("u_prev"), 0);
      gl.uniform2f(P.U("u_texel"), 1 / S, 1 / S);
      gl.uniform2f(P.U("u_mouse"), mx, my);
      gl.uniform2f(P.U("u_vel"), vx, vy);
      gl.uniform1f(P.U("u_aspect"), aspect);
      gl.uniform1f(P.U("u_on"), on);
      gl.uniform1f(P.U("u_keep"), Math.pow(0.972, dt * 60)); // slow, smooth return
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      [a, b] = [b, a];
      return a.t;
    },
  };
}

function Portrait({ src }: { src: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const gl = gl2(canvas);
    if (!gl) return;
    let raf = 0, alive = true, cleanup = () => {};
    const img = new Image();
    img.src = src;
    img.decode().then(() => {
      if (!alive) return;
      const P = program(gl, PORTRAIT_VS, DOT_FS, ["a_home", "a_l", "a_seed", "d0", "d1", "d2", "d3", "d4", "d5", "yr", "yr2", "o0", "o1", "o2", "o3", "fm"]);
      const Q = program(gl, PHOTO_VS, PHOTO_FS, ["a_pos"]);
      // Sample the cut-out (transparent background): dense where it's lit, thinner in the
      // dark clothes, with the brightness stretched so the figure reads as lit.
      const W = 460, H = Math.round((W * img.naturalHeight) / img.naturalWidth);
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(img, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data;
      // unsharp mask: lift each pixel away from its blurred surroundings, so small features
      // (glasses frames, fingers, the phone's edge) survive being turned into dots
      const bc = document.createElement("canvas"); bc.width = W; bc.height = H;
      const bx = bc.getContext("2d", { willReadFrequently: true })!;
      bx.filter = "blur(3px)"; bx.drawImage(img, 0, 0, W, H);
      const bd = bx.getImageData(0, 0, W, H).data;
      for (let k = 0; k < W * H * 4; k += 4) {
        if (d[k + 3] < 128 || bd[k + 3] < 200) continue;               // leave the outline alone
        for (let ch = 0; ch < 3; ch++) d[k + ch] = Math.min(255, Math.max(0, d[k + ch] + 0.9 * (d[k + ch] - bd[k + ch])));
      }
      const ls: number[] = [];
      for (let k = 0; k < W * H; k++) if (d[k * 4 + 3] > 128) ls.push((0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2]) / 255);
      ls.sort((a, b) => a - b);
      const lo = ls[Math.floor(ls.length * 0.03)] ?? 0, hi = ls[Math.floor(ls.length * 0.98)] ?? 1;
      const HB = 0.86;                                 // the figure is 86% of the canvas height,
      const DY = -(1 - HB);                            // standing on the bottom edge (room above the head)
      const sc = (2 * HB) / H;
      const home: number[] = [], lum: number[] = [];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const k = (j * W + i) * 4;
        if (d[k + 3] < 128) continue;
        const l0 = (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) / 255;
        const l = Math.min(1, Math.max(0, (l0 - lo) / (hi - lo)));
        // dots follow the light, like a halftone: bright skin is dense, the glasses, phone and
        // shadows stay nearly empty, so the features read (a few dim dots keep the outline)
        const c = 0.12 + 2.1 * Math.pow(l, 1.35);
        const n = Math.floor(c) + (Math.random() < c % 1 ? 1 : 0);
        for (let r = 0; r < n; r++) {
          home.push((i - W / 2 + Math.random() - 0.5) * sc, -(j - H / 2 + Math.random() - 0.5) * sc + DY);
          lum.push(0.3 + 0.7 * Math.pow(l, 0.8));
        }
      }
      const N = lum.length;
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      buffer(gl, 0, new Float32Array(home), 2); buffer(gl, 1, new Float32Array(lum), 1);
      buffer(gl, 2, new Float32Array(N * 3).map(() => Math.random()), 3);
      const dBufs = skills.map((_, i) => buffer(gl, 3 + i, new Float32Array(N * 2), 2));
      const yrBuf = buffer(gl, 9, new Float32Array(N * 2), 2);
      const yr2Buf = buffer(gl, 10, new Float32Array(N * 2), 2);
      afterHours.hobbies.forEach((h, k) => buffer(gl, 11 + k, shapePoints(h.shape, N), 3));
      const ow = [1, 0, 0, 0];
      // the contact form drawn as particles: title, labels, field lines and the button, at the
      // spot they sit once the section reaches the top of the screen (scroll = formY)
      const fmBuf = buffer(gl, 15, new Float32Array(N * 2), 2);
      let formY = 1e9, formLive = false, switchT = -1e9;
      const buildForm = () => {
        const form = document.querySelector<HTMLElement>(".ab__form"), sec = form?.closest<HTMLElement>(".ab__contact");
        if (!form || !sec) return;
        const vw = innerWidth, vh = innerHeight, k = 0.5;                 // drawn at half size
        // desktop: where the section reaches the top; phones (shorter stage, TV above the form):
        // where the form's title is just below the top bar
        formY = vw > 760 ? sec.getBoundingClientRect().top + scrollY : form.getBoundingClientRect().top + scrollY - vh * 0.14;
        formY = Math.min(formY, document.documentElement.scrollHeight - vh - 2);   // the page must reach it
        const c = document.createElement("canvas"); c.width = Math.round(vw * k); c.height = Math.round(vh * k);
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.scale(k, k); g.fillStyle = "#fff"; g.textBaseline = "top";
        const at = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY - formY, w: r.width, h: r.height }; };
        const text = (el: HTMLElement) => {
          const r = at(el), cs = getComputedStyle(el);
          g.font = cs.font;
          const t = cs.textTransform === "uppercase" ? (el.textContent ?? "").toUpperCase() : el.textContent ?? "";
          g.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
          g.fillText(t, r.x, r.y + Math.max(0, (r.h - parseFloat(cs.fontSize)) / 2));
        };
        form.querySelectorAll<HTMLElement>(".ab__contact-title, label span").forEach(text);
        form.querySelectorAll("input, textarea").forEach((el) => { const r = at(el); g.fillRect(r.x, r.y + r.h - 2, r.w, 2); });
        const btn = form.querySelector<HTMLElement>("button");
        if (btn) {
          const r = at(btn); g.fillRect(r.x, r.y, r.w, r.h);
          g.globalCompositeOperation = "destination-out"; text(btn); g.globalCompositeOperation = "source-over";
        }
        const d = g.getImageData(0, 0, c.width, c.height).data, px: number[] = [];
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 120) px.push(x, y);
        if (!px.length) return;
        // into the stage canvas's own units (it is shorter than the screen on phones)
        const cr = canvas.getBoundingClientRect(), ca = cr.width / cr.height, out = new Float32Array(N * 2);
        for (let i = 0; i < N; i++) {
          const j = Math.floor(Math.random() * (px.length / 2)) * 2;
          out[i * 2] = ((((px[j] + Math.random()) / k) - cr.left) / cr.width * 2 - 1) * ca;
          out[i * 2 + 1] = 1 - ((((px[j + 1] + Math.random()) / k) - cr.top) / cr.height) * 2;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, fmBuf);
        gl.bufferData(gl.ARRAY_BUFFER, out, gl.STATIC_DRAW);
      };
      let ang = 0;
      let unstickY = 1e9;
      // the first year, at the spot the year canvas will sit once it is stuck in place
      let stickY = 1e9;
      const buildYear = () => {
        const yc = document.querySelector<HTMLCanvasElement>(".ab__year");
        const holder = yc?.parentElement;
        if (!yc || !holder) return;
        const vw = innerWidth, vh = innerHeight;
        const r = yc.getBoundingClientRect();
        const top = parseFloat(getComputedStyle(holder).top) || 0;      // sticky top
        stickY = r.top + scrollY - top;                                   // scroll where it sticks
        const ca = r.width / r.height, va = vw / vh;
        // scroll where the year lets go again (the end of the timeline)
        const grid = holder.parentElement!;
        unstickY = grid.getBoundingClientRect().bottom + scrollY - top - holder.offsetHeight;
        const toScreen = (year: string) => {
          const pts = textPoints(year, ca, N);
          const out = new Float32Array(N * 2);
          for (let i = 0; i < N; i++) {
            const cx = pts[i * 2] / ca, cy = pts[i * 2 + 1];              // clip units in the year canvas
            const px = r.left + (cx * 0.5 + 0.5) * r.width, py = top + (0.5 - cy * 0.5) * r.height;
            out[i * 2] = (px / vw * 2 - 1) * va;
            out[i * 2 + 1] = 1 - (py / vh) * 2;
          }
          return out;
        };
        gl.bindBuffer(gl.ARRAY_BUFFER, yrBuf);
        gl.bufferData(gl.ARRAY_BUFFER, toScreen(experience[0].year), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, yr2Buf);
        gl.bufferData(gl.ARRAY_BUFFER, toScreen(experience[experience.length - 1].year), gl.STATIC_DRAW);
      };
      const buildDiagrams = () => {
        const asp = canvas.clientWidth / Math.max(1, canvas.clientHeight);
        skills.forEach((sk, i) => {
          gl.bindBuffer(gl.ARRAY_BUFFER, dBufs[i]);
          gl.bufferData(gl.ARRAY_BUFFER, iconPoints(sk.icon, N, asp), gl.STATIC_DRAW);
        });
      };
      (document.fonts?.ready ?? Promise.resolve()).then(() => { buildDiagrams(); buildYear(); buildForm(); });
      const qvao = gl.createVertexArray(); gl.bindVertexArray(qvao);
      buffer(gl, 0, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const box = [-(W / 2) * sc, -(H / 2) * sc + DY, (W / 2) * sc, (H / 2) * sc + DY]; // x0 y0 x1 y1

      let dpr = 1;
      const fit = () => { dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr); };
      fit();
      const onResize = () => { fit(); buildDiagrams(); buildYear(); buildForm(); };
      addEventListener("resize", onResize);
      const m = { x: 9, y: 9, sx: 9, sy: 9, on: false };
      const wts = new Float32Array(11);
      const smear = makeSmear(gl);
      let lastT = performance.now();
      let reveal = 0;
      const onMove = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        m.x = ((e.clientX - r.left) / r.width * 2 - 1) * (r.width / r.height);
        m.y = -((e.clientY - r.top) / r.height * 2 - 1);
        // over the figure (roughly its box)
        m.on = Math.abs(m.x) < (W / 2) * sc * 0.9 && Math.abs(m.y - DY) < (H / 2) * sc;
      };
      const onLeave = () => { m.on = false; };
      addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerleave", onLeave);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const t0 = performance.now();
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const t = (now - t0) / 1000;
        m.sx += (m.x - m.sx) * 0.18; m.sy += (m.y - m.sy) * 0.18;
        // scroll → which shape: the portrait until "What I do" arrives, then one diagram per screen
        const sec = document.querySelector<HTMLElement>(".ab__do");
        const vh = innerHeight, sy = scrollY, K = skills.length;
        const T2 = sec ? sec.offsetTop : 1e9;
        const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const enter = sm(T2 - vh * 0.85, T2 - vh * 0.05, sy);
        const idx = Math.min(K - 1, Math.max(0, (sy - T2) / vh));
        const i0 = Math.floor(idx), fr = sm(0.2, 0.8, idx - i0);
        wts.fill(0);
        wts[0] = 1 - enter;
        wts[1 + i0] += enter * (1 - fr);
        if (i0 + 1 < K) wts[2 + i0] += enter * fr;
        // after Maintain the same particles travel to the first year and become it
        const endD = T2 + (K - 1) * vh;
        const toYear = sm(endD + vh * 0.15, stickY - vh * 0.05, sy);
        if (toYear > 0) { for (let q = 0; q < 7; q++) wts[q] *= 1 - toYear; wts[7] = toYear; }
        const loose = Math.max(Math.sin(Math.PI * enter), Math.sin(Math.PI * fr) * enter, Math.sin(Math.PI * toYear));
        // then hand over to the year canvas (it takes over the morphs between years)
        const hand = sm(stickY - vh * 0.06, stickY + vh * 0.04, sy);
        // at the end of the timeline, take the last year back and turn it into the hobby object
        const ah = document.querySelector<HTMLElement>(".ab__after");
        const afterTop = ah ? ah.offsetTop : 1e9;
        const back = sm(unstickY - vh * 0.3, unstickY - vh * 0.12, sy);
        const toRec = sm(unstickY - vh * 0.12, afterTop - vh * 0.05, sy);
        if (back > 0) { wts.fill(0); wts[8] = 1 - toRec; wts[9] = toRec; }
        // on into Contact: the object flies apart and draws the form, then the real form takes over
        const toForm = sm(afterTop + vh * 0.1, formY - vh * 0.1, sy);
        if (toForm > 0) { for (let q = 0; q < 10; q++) wts[q] *= 1 - toForm; wts[10] = toForm; }
        // the swap is a glitch, not a fade: the real form glitches in while the particles
        // flicker out with slices jumping (and the reverse when you scroll back up)
        const formOn = sm(formY - vh * 0.12, formY + vh * 0.02, sy);
        const live = formLive ? formOn > 0.35 : formOn > 0.65;
        const fEl = document.querySelector<HTMLElement>(".ab__form");
        if (fEl && formY < 1e8 && fEl.dataset.live !== (live ? "on" : "off")) {
          if (live !== formLive) { formLive = live; switchT = now; }
          fEl.dataset.live = live ? "on" : "off";
        }
        const ts = (now - switchT) / 1000, step = Math.floor(ts / 0.045);
        const flick = ts < 0.36 ? (formLive ? [1, 0.15, 1, 0, 0.7, 0.05, 0.4, 0][step] : [0, 0.6, 0, 1, 0.3, 1, 0.7, 1][step]) : formLive ? 0 : 1;
        const glitch = ts < 0.36 ? 1 : 0;
        const fade = Math.max(1 - hand, back) * flick;
        const yEl = document.querySelector<HTMLElement>(".ab__year");
        if (yEl) yEl.style.opacity = String(stickY < 1e8 ? hand * (1 - back) : 1);
        // fewer particles on the way to the year (it reads best light), more again for the object
        const yearShare = YEAR_N / N;
        const keep = back > 0 ? yearShare + (0.6 - yearShare) * toRec : 1 + (yearShare - 1) * toYear;
        // changing channel: the shapes cross-fade and the particles swirl loose on the way
        const dtc = Math.min(0.1, (now - lastT) / 1000);
        for (let k = 0; k < 4; k++) ow[k] += ((k === tv.ch ? 1 : 0) - ow[k]) * (1 - Math.exp(-dtc * 4.5));
        const swap = 1 - Math.max(...ow);
        const looseAll = Math.max(loose, Math.sin(Math.PI * toRec), Math.min(1, swap * 2.2), Math.sin(Math.PI * toForm));
        const over = m.on && enter < 0.05;
        reveal += ((over ? 1 : 0) - reveal) * 0.08;
        // over the figure the cursor ring becomes a big lens the size of the reveal circle
        const big = over ? "on" : "off";
        if (document.documentElement.dataset.cursorBig !== big) {
          document.documentElement.dataset.cursorBig = big;
          document.documentElement.style.setProperty("--cursor-big", `${Math.round(REVEAL_R * 0.8 * canvas.clientHeight)}px`);
        }
        const aspect = canvas.width / canvas.height;
        const rect = rectOf(canvas);
        const dts = Math.min(0.05, (now - lastT) / 1000); lastT = now;
        const smTex = reduced ? null : smear.update(m.x === 9 ? -9 : m.x / aspect * 0.5 + 0.5, m.y === 9 ? -9 : m.y * 0.5 + 0.5, aspect, dts);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        // photo inside the reveal circle
        gl.useProgram(Q.p); gl.bindVertexArray(qvao);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(Q.U("u_img"), 0);
        gl.uniform4f(Q.U("u_box"), box[0], box[1], box[2], box[3]);
        gl.uniform1f(Q.U("u_aspect"), aspect);
        gl.uniform1f(Q.U("u_t"), t);
        gl.uniform4f(Q.U("u_rect"), ...rect);
        gl.uniform2f(Q.U("u_turn"), ...turnClip());
        gl.uniform1f(Q.U("u_clk"), clk());
        gl.uniform2f(Q.U("u_mouse"), m.sx, m.sy);
        gl.uniform1f(Q.U("u_reveal"), reveal);
        gl.uniform1f(Q.U("u_rad"), REVEAL_R);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // particles
        gl.useProgram(P.p); gl.bindVertexArray(vao);
        gl.uniform1f(P.U("u_t"), reduced ? 0 : t);
        gl.uniform1f(P.U("u_gather"), reduced ? 1 : Math.min(1, t / 2.2));
        gl.uniform1f(P.U("u_aspect"), aspect);
        gl.uniform1f(P.U("u_size"), 1.6 * dpr);
        gl.uniform4f(P.U("u_rect"), ...rect);
        gl.uniform2f(P.U("u_turn"), ...turnClip());
        gl.uniform1f(P.U("u_clk"), clk());
        gl.uniform2f(P.U("u_mouse"), m.sx, m.sy);
        gl.uniform1f(P.U("u_reveal"), reveal);
        gl.uniform1f(P.U("u_rad"), REVEAL_R);
        gl.uniform1fv(P.U("w"), wts);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, smTex);
        gl.uniform1i(P.U("u_smear"), 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1f(P.U("u_loose"), reduced ? 0 : looseAll);
        gl.uniform1f(P.U("u_fade"), fade);
        gl.uniform1f(P.U("u_keep"), keep);
        gl.uniform1f(P.U("u_fmy"), ((sy - formY) * 2) / canvas.clientHeight);
        gl.uniform1f(P.U("u_glitch"), reduced ? 0 : glitch);
        // each object turns its own way: the ball rolls, the pad, note and chip sway
        const tt = reduced ? 0 : t;
        ang = tt * 0.5;
        const sway = Math.sin(tt * 0.6) * 0.5 + turn.x * 0.25;
        const rots = [
          mat3(rotX(-0.35 + turn.y * 0.1), rotY(ang)),
          mat3(rotX(-0.3 + turn.y * 0.1), rotY(sway * 0.7)),
          mat3(rotX(-0.2 + turn.y * 0.1), rotY(Math.sin(tt * 0.8) * 0.55 + turn.x * 0.25)),
          mat3(rotX(-0.75 + turn.y * 0.1), rotZ(sway * 0.6)),
        ];
        gl.uniformMatrix3fv(P.U("u_rot"), false, new Float32Array(rots.flat()));
        gl.uniform1fv(P.U("u_ow"), new Float32Array(ow));
        gl.uniform1f(P.U("u_vs"), aspect > 1 ? 0.46 : aspect * 0.56);
        // phones: in the gap between the channel number and the guide (46% down the screen)
        gl.uniform2f(P.U("u_vc"), aspect > 1 ? aspect * 0.3 : 0, aspect > 1 ? 0.0 : 1 - (2 * (innerHeight * 0.46 - rect[1] * innerHeight)) / canvas.clientHeight);
        gl.drawArrays(gl.POINTS, 0, N);
      };
      raf = requestAnimationFrame(frame);
      cleanup = () => { removeEventListener("resize", onResize); removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave); };
    }).catch(() => {});
    return () => { alive = false; cancelAnimationFrame(raf); cleanup(); delete document.documentElement.dataset.cursorBig; };
  }, [src]);
  return <canvas ref={ref} className="ab__portrait" role="img" aria-label="Portrait of Kaung Myat Soe, drawn in particles. Hover to reveal the photo." />;
}

/* ---------- 2. The year in particles ---------- */
const YEAR_VS = `#version 300 es
in vec2 a_from; in vec2 a_to; in vec3 a_seed;
uniform float u_k, u_t, u_aspect, u_size;
uniform vec2 u_mouse;
uniform sampler2D u_smear;
out float v_l; out float v_a;
${CRT}
void main(){
  float a = clamp(u_k * 1.5 - a_seed.z * 0.5, 0.0, 1.0);
  float e = a < 0.5 ? 4.0 * a * a * a : 1.0 - pow(-2.0 * a + 2.0, 3.0) / 2.0;
  vec2 p = mix(a_from, a_to, e);
  // swirl loose midway between two years
  float s = sin(3.14159 * a);
  float ang = a_seed.x * 6.2831 + u_t * 0.6;
  p += vec2(cos(ang), sin(ang)) * s * (0.12 + a_seed.y * 0.25);
  p += vec2(sin(u_t * 0.9 + a_seed.z * 30.0), cos(u_t * 0.8 + a_seed.x * 20.0)) * 0.003;
  vec2 sm = textureLod(u_smear, vec2(p.x / u_aspect * 0.5 + 0.5, p.y * 0.5 + 0.5), 0.0).xy;
  p += (sm * (0.5 + 1.3 * a_seed.y) + vec2(-sm.y, sm.x) * (a_seed.x - 0.5) * 1.6) * vec2(u_aspect, 1.0);
  gl_Position = vec4(crt(vec2(p.x / u_aspect, p.y), u_t), 0.0, 1.0);
  gl_PointSize = u_size;
  v_l = 0.92;
  v_a = 0.95;
}`;

const YEAR_N = 9000;
const MORPH_S = 1.1;

/** YEAR_N points filling the given text, in canvas units (x scaled by aspect, y -1..1). */
function textPoints(text: string, aspect: number, count = YEAR_N) {
  const H = 200, W = Math.round(H * aspect);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.fillStyle = "#fff";
  x.textBaseline = "middle";
  x.textAlign = "left";
  let size = 150;
  x.font = `700 ${size}px "Inter Tight", system-ui, sans-serif`;
  const w = x.measureText(text).width;
  if (w > W * 0.96) { size *= (W * 0.96) / w; x.font = `700 ${size}px "Inter Tight", system-ui, sans-serif`; }
  x.fillText(text, W * 0.02, H * 0.5);
  const d = x.getImageData(0, 0, W, H).data;
  const inside: number[] = [];
  for (let k = 0; k < W * H; k++) if (d[k * 4 + 3] > 128) inside.push(k);
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const k = inside[Math.floor(Math.random() * inside.length)] ?? 0;
    const px = (k % W) + Math.random(), py = Math.floor(k / W) + Math.random();
    out[i * 2] = (px / W * 2 - 1) * aspect;
    out[i * 2 + 1] = -(py / H * 2 - 1);
  }
  return out;
}

function YearParticles({ year }: { year: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const yearRef = useRef(year);
  yearRef.current = year;
  useEffect(() => {
    const canvas = ref.current!;
    const gl = gl2(canvas);
    if (!gl) return;
    const { p, U } = program(gl, YEAR_VS, DOT_FS, ["a_from", "a_to", "a_seed"]);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    let dpr = 1, aspect = 2.4;
    const fit = () => { dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr); aspect = canvas.width / canvas.height; };
    fit();
    let shown = "", from = new Float32Array(YEAR_N * 2), to = new Float32Array(YEAR_N * 2);
    for (let i = 0; i < YEAR_N; i++) { from[i * 2] = (Math.random() * 2 - 1) * aspect; from[i * 2 + 1] = Math.random() * 2 - 1; }
    const bFrom = buffer(gl, 0, from, 2, gl.DYNAMIC_DRAW), bTo = buffer(gl, 1, to, 2, gl.DYNAMIC_DRAW);
    buffer(gl, 2, new Float32Array(YEAR_N * 3).map(() => Math.random()), 3);
    let k = 1, raf = 0;
    const seeds = new Float32Array(YEAR_N).map(() => Math.random());
    const upload = () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, bFrom); gl.bufferSubData(gl.ARRAY_BUFFER, 0, from);
      gl.bindBuffer(gl.ARRAY_BUFFER, bTo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, to);
    };
    const go = (y: string) => {
      // start from where the particles are now (mid-morph too), then head for the new year
      const kk = Math.min(1, k);
      for (let i = 0; i < YEAR_N; i++) {
        const a = Math.min(1, Math.max(0, kk * 1.5 - seeds[i] * 0.5));
        const e = ease(a);
        from[i * 2] = from[i * 2] + (to[i * 2] - from[i * 2]) * e;
        from[i * 2 + 1] = from[i * 2 + 1] + (to[i * 2 + 1] - from[i * 2 + 1]) * e;
      }
      to = textPoints(y, aspect);
      if (!shown) { from = to.slice(); upload(); k = 1; shown = y; return; } // delivered by the stage particles
      upload(); k = 0; shown = y;
    };
    const onResize = () => { fit(); if (shown) { from = to.slice(); go(shown); k = 1; } };
    addEventListener("resize", onResize);
    const m = { x: 9, y: 9, sx: 9, sy: 9 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      m.x = ((e.clientX - r.left) / r.width * 2 - 1) * aspect;
      m.y = -((e.clientY - r.top) / r.height * 2 - 1);
    };
    addEventListener("pointermove", onMove, { passive: true });
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const smear = makeSmear(gl);
    let last = performance.now();
    const t0 = last;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (yearRef.current !== shown) go(yearRef.current);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      k = reduced ? 1 : Math.min(1.2, k + dt / MORPH_S);
      m.sx += (m.x - m.sx) * 0.15; m.sy += (m.y - m.sy) * 0.15;
      const smTex = reduced ? null : smear.update(m.x === 9 ? -9 : m.x / aspect * 0.5 + 0.5, m.y === 9 ? -9 : m.y * 0.5 + 0.5, aspect, dt);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(p); gl.bindVertexArray(vao);
      gl.uniform1f(U("u_k"), Math.min(1, k));
      gl.uniform1f(U("u_t"), (now - t0) / 1000);
      gl.uniform1f(U("u_aspect"), aspect);
      gl.uniform1f(U("u_size"), 1.9 * dpr);
      gl.uniform2f(U("u_mouse"), m.sx, m.sy);
      gl.uniform4f(U("u_rect"), ...rectOf(canvas));
      gl.uniform2f(U("u_turn"), ...turnClip());
      gl.uniform1f(U("u_clk"), clk());
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, smTex);
      gl.uniform1i(U("u_smear"), 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.drawArrays(gl.POINTS, 0, YEAR_N);
    };
    // wait for the web font so the digits are drawn in Inter Tight
    (document.fonts?.ready ?? Promise.resolve()).then(() => { raf = requestAnimationFrame(frame); });
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", onResize); removeEventListener("pointermove", onMove); };
  }, []);
  return <canvas ref={ref} className="ab__year" aria-hidden="true" />;
}




/* 3D shapes for the hobby channels, as (x, y, z) about radius 1. */
const rotX = (a: number) => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)];
const rotY = (a: number) => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];
const rotZ = (a: number) => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1];
/** a × b for column-major 3×3 matrices (b is applied first). */
function mat3(a: number[], b: number[]) {
  const o = new Array(9).fill(0);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) o[c * 3 + r] += a[k * 3 + r] * b[c * 3 + k];
  return o;
}

/** A football: dense pentagon patches on a sparser sphere. */
function ballPoints(N: number) {
  const f = (1 + Math.sqrt(5)) / 2, v: number[][] = [];
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) v.push([0, s1, s2 * f], [s1, s2 * f, 0], [s2 * f, 0, s1]);
  const vn = v.map((p) => { const l = Math.hypot(p[0], p[1], p[2]); return p.map((c) => c / l); });
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; ) {
    const g = [0, 0, 0].map(() => { let u = 0; for (let k = 0; k < 6; k++) u += Math.random(); return u - 3; });
    const l = Math.hypot(g[0], g[1], g[2]) || 1, p = g.map((c) => c / l);
    const near = Math.max(...vn.map((q) => q[0] * p[0] + q[1] * p[1] + q[2] * p[2]));
    const ang = Math.acos(Math.min(1, near));
    // pentagons filled, the seams around them drawn, the hexagons light
    const keep = ang < 0.3 ? 1 : Math.abs(ang - 0.345) < 0.025 ? 0.55 : 0.05;
    if (Math.random() > keep) continue;
    out.set(p.map((c) => c * 0.95), i * 3); i++;
  }
  return out;
}

/** A flat drawing (400×280, white on clear) given depth, as 3D points. */
function extrude(N: number, draw: (g: CanvasRenderingContext2D) => void) {
  const W = 400, H = 280, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff";
  draw(g);
  const d = g.getImageData(0, 0, W, H).data, inside: number[] = [], edge: number[] = [];
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 128;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on(x, y)) continue;
    inside.push(x, y);
    if (!on(x + 1, y) || !on(x - 1, y) || !on(x, y + 1) || !on(x, y - 1)) edge.push(x, y);
  }
  const out = new Float32Array(N * 3), D = 0.12;
  for (let i = 0; i < N; i++) {
    const q = Math.random();
    const src = q < 0.5 ? inside : edge;
    const k = Math.floor(Math.random() * (src.length / 2)) * 2;
    const x = (src[k] + Math.random() - 200) / 165, y = -(src[k + 1] + Math.random() - 135) / 165;
    // front face; the outline and any holes drawn on the front too, so they read
    const z = q < 0.42 ? D : q < 0.5 ? -D : q < 0.85 ? D : (Math.random() * 2 - 1) * D;
    out.set([x, y, z], i * 3);
  }
  return out;
}

/** Two beamed notes (♫). */
const notePoints = (N: number) => extrude(N, (g) => {
  g.beginPath(); g.ellipse(128, 222, 46, 33, -0.45, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(292, 196, 46, 33, -0.45, 0, Math.PI * 2); g.fill();
  g.fillRect(156, 52, 17, 168); g.fillRect(320, 26, 17, 168);                     // stems
  g.beginPath(); g.moveTo(156, 52); g.lineTo(337, 22); g.lineTo(337, 64); g.lineTo(156, 94); g.closePath(); g.fill(); // beam
});

/** A game controller: a drawn silhouette (buttons cut out), given depth. */
const padPoints = (N: number) => extrude(N, (g) => {
  g.beginPath(); g.roundRect(60, 50, 280, 112, 54); g.fill();
  g.beginPath(); g.ellipse(108, 158, 46, 88, -0.38, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(292, 158, 46, 88, 0.38, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = "destination-out";
  g.fillRect(92, 98, 50, 15); g.fillRect(110, 80, 15, 51);                       // d-pad
  [[288, 82], [288, 128], [265, 105], [311, 105]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill(); });
  [[163, 150], [237, 150]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 25, 0, Math.PI * 2); g.fill(); });
  g.fillRect(180, 86, 14, 7); g.fillRect(206, 86, 14, 7);                          // select / start
  g.globalCompositeOperation = "source-over";
  [[163, 150], [237, 150]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill(); }); // sticks
});

/** Code: a chunky "</>" with a few code lines under it. */
const codePoints = (N: number) => extrude(N, (g) => {
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#fff"; g.lineWidth = 30;
  g.beginPath(); g.moveTo(140, 50); g.lineTo(60, 120); g.lineTo(140, 190); g.stroke();      // <
  g.beginPath(); g.moveTo(260, 50); g.lineTo(340, 120); g.lineTo(260, 190); g.stroke();     // >
  g.beginPath(); g.moveTo(222, 32); g.lineTo(178, 208); g.stroke();                         // /
  g.lineWidth = 14;
  [[70, 248, 190], [210, 248, 250], [270, 248, 330]].forEach(([x1, y, x2]) => { g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); });
});

function shapePoints(shape: HobbyShape, N: number) {
  return shape === "ball" ? ballPoints(N) : shape === "pad" ? padPoints(N) : shape === "note" ? notePoints(N) : codePoints(N);
}
/** The channel on the TV, shared with the particle stage. */
const tv = { ch: 0 };

/** (04) After hours: an old TV's channel guide, one channel per hobby. */
function AfterHours() {
  const H = afterHours.hobbies;
  const [ch, setCh] = useState(0);
  const [seen, setSeen] = useState(false);
  const [tick, setTick] = useState(0);              // restarts the timer after a click
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { tv.ch = ch; }, [ch]);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setSeen(e.intersectionRatio > 0.6), { threshold: [0, 0.6, 1] });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!seen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => setCh((c) => (c + 1) % H.length), CH_MS);
    return () => window.clearTimeout(id);
  }, [seen, ch, tick, H.length]);
  const pick = (i: number) => { setCh(i); setTick((t) => t + 1); };
  const no = (i: number) => String(i + 1).padStart(2, "0");
  return (
    <section ref={ref} className="ab__after" aria-labelledby="ab-after">
      <div className="ab__do-head">
        <p className="ab__label"><span>(04)</span> Off the clock</p>
        <p className="ab__do-note">{afterHours.note}</p>
      </div>
      <div className="ab__tv">
        <ol className="ab__guide" aria-label="Channels">
          {H.map((h, i) => (
            <li key={h.name}>
              <button type="button" aria-current={i === ch} onClick={() => pick(i)}>
                <span>CH {no(i)}</span><b>{h.name}</b>
              </button>
            </li>
          ))}
        </ol>
        <div className="ab__osd">
          <p className="ab__osd-play" aria-hidden="true">▶ PLAY</p>
          <p key={ch} className="ab__osd-ch gx-text" aria-hidden="true">CH {no(ch)}</p>
          <h2 id="ab-after" className="ab__osd-name">{afterHours.title}</h2>
        </div>
      </div>
      <div className="ab__tv-foot">
        <p key={ch} className="ab__tv-line gx-text" aria-live="polite">{H[ch].line}</p>
        <div className="ab__seg" data-run={seen} aria-hidden="true"><i key={`${ch}-${tick}`} style={{ animationDuration: `${CH_MS}ms` }} /></div>
      </div>
    </section>
  );
}
const CH_MS = 5200;
/** Radius of the photo reveal around the pointer (clip units of the stage's height). */
const REVEAL_R = 0.3;

/** The intro name, glitching between "I'm Kaung Myat Soe," and "Aka K," on a loop. */
function AltName({ names }: { names: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % names.length), 3600);
    return () => window.clearInterval(id);
  }, [names.length]);
  return <span key={i} className="ab__name gx-text" aria-hidden="true">{names[i]}</span>;
}

/* ---------- Page background: a curved TV grid behind everything ---------- */
const BG_VS = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const BG_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform float u_t, u_aspect, u_scroll, u_clk; uniform vec2 u_turn;
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
${GLITCH}
void main(){
  vec2 n = v_uv * 2.0 - 1.0;
  float r2 = dot(n, n);
  vec2 c = n * (1.0 + 0.11 * r2) / (1.0 + 0.11 * 0.97);   // content bows out like the landing
  c += u_turn * vec2(0.035, 0.03);
  float rb;
  c.x += glitchX(0.5 - c.y * 0.5, u_clk, rb) * 2.0;
  // 12 columns, rows 2.4 columns tall, scrolling with the page
  vec2 g = vec2((c.x * 0.5 + 0.5) * 12.0, ((0.5 - c.y * 0.5) + u_scroll) * 12.0 / (2.4 * u_aspect));
  vec2 f = abs(fract(g) - 0.5);
  float lw = fwidth(g.x) * 0.9, lh = fwidth(g.y) * 0.9;
  float line = max(smoothstep(0.5 - lw, 0.5, f.x), smoothstep(0.5 - lh, 0.5, f.y));
  float vig = smoothstep(1.8, 0.4, length(n * vec2(1.0, 0.9)));
  vec3 col = vec3(0.043) + vec3(0.07) * line * vig;
  col += (hsh(v_uv * vec2(1920.0, 1080.0) + u_t) - 0.5) * 0.025;
  col += rb * 0.03;                                         // the tracking band's glow
  o = vec4(col * (0.7 + 0.3 * vig), 1.0);
}`;

function CrtBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl2");
    if (!gl) return;
    const { p, U } = program(gl, BG_VS, BG_FS, ["a_pos"]);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    buffer(gl, 0, new Float32Array([-1, -1, 3, -1, -1, 3]), 2);
    const fit = () => { const d = Math.min(devicePixelRatio || 1, 1.5); canvas.width = Math.round(innerWidth * d); canvas.height = Math.round(innerHeight * d); };
    fit(); addEventListener("resize", fit);
    const onMove = (e: PointerEvent) => { turn.tx = (e.clientX / innerWidth) * 2 - 1; turn.ty = -((e.clientY / innerHeight) * 2 - 1); };
    addEventListener("pointermove", onMove, { passive: true });
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = canvas.closest<HTMLElement>(".ab");
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!reduced) { turn.x += (turn.tx - turn.x) * 0.06; turn.y += (turn.ty - turn.y) * 0.06; }
      root?.style.setProperty("--mx", turn.x.toFixed(4));
      root?.style.setProperty("--my", turn.y.toFixed(4));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(p); gl.bindVertexArray(vao);
      gl.uniform1f(U("u_t"), (now - t0) / 1000);
      gl.uniform1f(U("u_aspect"), canvas.width / canvas.height);
      gl.uniform1f(U("u_scroll"), scrollY / innerHeight);
      gl.uniform2f(U("u_turn"), turn.x, turn.y);
      gl.uniform1f(U("u_clk"), clk());
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", fit); removeEventListener("pointermove", onMove); };
  }, []);
  return <canvas ref={ref} className="ab__bg" aria-hidden="true" />;
}

/** (05) Contact: a form beside an old TV that shows what you type. */
function Contact() {
  const screen = useRef<TvScreen>({ name: "", msg: "", state: "idle" });
  const [sent, setSent] = useState(false);
  const onInput = (e: React.FormEvent<HTMLFormElement>) => {
    const f = new FormData(e.currentTarget);
    screen.current.name = String(f.get("name") ?? "");
    screen.current.msg = String(f.get("message") ?? "");
    if (screen.current.state === "sent") screen.current.state = "idle";
  };
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name")), from = String(f.get("email")), msg = String(f.get("message"));
    screen.current.state = "sending";
    const href = `mailto:${site.email}?subject=${encodeURIComponent(`Hello from ${name}`)}&body=${encodeURIComponent(`${msg}\n\n${name}\n${from}`)}`;
    window.setTimeout(() => { window.location.href = href; screen.current.state = "sent"; setSent(true); }, 1100);
  };
  const c = contact.credit;
  return (
    <section className="ab__contact" aria-labelledby="ab-contact">
      <div className="ab__do-head">
        <p className="ab__label"><span>(05)</span> Contact</p>
        <p className="ab__do-note">{contact.note}</p>
      </div>
      <div className="ab__contact-grid">
        <form className="ab__form" onInput={onInput} onSubmit={onSubmit}>
          <h2 id="ab-contact" className="ab__contact-title">{contact.title}</h2>
          <p className="ab__contact-body">{contact.body}</p>
          <label><span>Name</span><input name="name" required autoComplete="name" /></label>
          <label><span>Email</span><input name="email" type="email" required autoComplete="email" /></label>
          <label><span>Message</span><textarea name="message" rows={4} required /></label>
          <div className="ab__form-foot">
            <button type="submit">▶ Send</button>
            <p aria-live="polite">{sent ? "Your mail app should be open. If not, " : "Or write to "}<a href={`mailto:${site.email}`}>{site.email}</a></p>
          </div>
        </form>
        <div className="ab__contact-tv"><ContactTv screen={screen} turn={turn} /></div>
      </div>
      <p className="ab__credit">
        TV model: <a href={c.titleUrl} target="_blank" rel="noopener noreferrer">{c.title}</a> by{" "}
        <a href={c.authorUrl} target="_blank" rel="noopener noreferrer">{c.author}</a>,{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
      </p>
    </section>
  );
}

export default function AboutStory() {
  const [active, setActive] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => { tvOn(mainRef.current, () => 0); }, []); // always open at the top
  const listRef = useRef<HTMLOListElement>(null);
  // "What I do": which skill is on screen (follows the scroll, like the particles)
  const [skill, setSkill] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const sec = document.querySelector<HTMLElement>(".ab__do");
      if (!sec) return;
      const idx = (scrollY - sec.offsetTop) / innerHeight;
      setSkill(Math.min(skills.length - 1, Math.max(0, Math.round(idx))));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  const goSkill = (i: number) => {
    const sec = document.querySelector<HTMLElement>(".ab__do");
    if (sec) scrollTo({ top: sec.offsetTop + i * innerHeight, behavior: "smooth" });
  };

  // the entry nearest the middle of the screen is the active one
  useEffect(() => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>("li") ?? [])];
    let raf = 0;
    const update = () => {
      raf = 0;
      const mid = innerHeight * 0.5;
      let best = 0, bd = Infinity;
      items.forEach((el, i) => { const r = el.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = i; } });
      setActive(best);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);

  const e = experience[active];
  const first = Number(experience[0].year);
  const yearN = Number(e.year) - first + 1;

  return (
    <main ref={mainRef} className="ab">
      <CrtBackground />
      <header className="ab__top">
        <Link className="brand" href="/"><KLogo />{site.name}</Link>
        <TvLink className="link" href="/#work">Selected work →</TvLink>
      </header>

      <Portrait src={aboutIntro.photo} />
      <section className="ab__me" aria-labelledby="ab-me">
        <div className="ab__me-left gx-text">
          <p className="ab__label"><span>(01)</span> {aboutIntro.label}</p>
          <h1 id="ab-me" className="ab__title" aria-label={`${aboutIntro.name} ${aboutIntro.role}`}>
            <AltName names={[aboutIntro.name, aboutIntro.alias]} />
            <span>{aboutIntro.role}</span>
          </h1>
        </div>
        <div className="ab__me-right gx-text gx-text--late">
          {aboutIntro.body.map((b) => <p key={b} className="ab__body">{b}</p>)}
          <p className="ab__links">
            <a href={`mailto:${site.email}`}>{site.email}</a>
            <a href={site.resume} target="_blank" rel="noopener">Résumé ↗</a>
            {site.socials.map((s) => <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer">{s.label} ↗</a>)}
          </p>
        </div>
      </section>

      <section className="ab__do" aria-labelledby="ab-do" style={{ height: `${skills.length * 100}svh` }}>
        <div className="ab__do-pin">
          <div className="ab__do-head">
            <p className="ab__label"><span>(02)</span> What I do</p>
            <p className="ab__do-note">From the first sketch to the last API call</p>
          </div>
          <div className="ab__do-text" key={skill} aria-live="polite">
            <p className="ab__do-tag gx-text">{skills[skill].tagline}</p>
            <h2 id="ab-do" className="ab__do-title gx-text">{skills[skill].name}</h2>
            <p className="ab__do-body gx-text gx-text--late">{skills[skill].body}</p>
          </div>
          <ol className="ab__do-tabs">
            {skills.map((k, i) => (
              <li key={k.name}>
                <button type="button" aria-current={i === skill} onClick={() => goSkill(i)}>
                  <span>{String(i + 1).padStart(2, "0")}</span>{k.name}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ab__exp" aria-labelledby="ab-exp">
        <div className="ab__exp-head">
          <p className="ab__label"><span>(03)</span> Experience</p>
          <h2 id="ab-exp" className="ab__lead">
            Since <b>{experience[0].year}</b> I&apos;ve been studying, building and shipping: web apps, mobile apps and machine learning.
          </h2>
        </div>
        <div className="ab__exp-grid">
          <div className="ab__exp-year">
            <YearParticles year={e.year} />
            <p className="ab__yearcap" aria-live="polite">
              <span className="sr-only">{e.year}. </span>
              {e.now ? <>Year {yearN} <i>Now</i></> : <>Year {yearN}</>}
            </p>
          </div>
          <ol ref={listRef} className="ab__timeline">
            {experience.map((x, i) => (
              <li key={x.title} data-on={i === active}>
                <span className="ab__when">{x.year}{x.now && <i>Now</i>}</span>
                <h3>{x.title}</h3>
                <p className="ab__where">{x.where}</p>
                <p className="ab__detail">{x.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <AfterHours />
      <Contact />
    </main>
  );
}
