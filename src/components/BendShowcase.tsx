"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { projects } from "@/content/projects";
import { site } from "@/content/site";
import { RETURN_KEY } from "./ProjectDetail";
import { BEND, CARD_AR, CARD_KEY, CARD_W, EDGE, PARALLAX, cardGrid } from "@/lib/cardGrid";
import { homeShot, homeShotMouse, setHomeShot } from "@/lib/snapshot";
import KLogo from "./KLogo";
import BmoScreen from "./BmoScreen";
import { CARD_CREDIT, drawCardFace, loadCardFace } from "@/lib/cardFace";
import TvLink from "./TvLink";

/*
 * Home page project section (second screen, under the ink K).
 *
 * Big project screens on a straight diagonal strip (next one lower-right, previous one
 * upper-left), seen through a lens that is flat in the middle and bends hard at the
 * edges, with a soft VHS layer: a glitch wave sweeping top → bottom (the picture breaks
 * into rippling particles where it passes), gentle colour bleed, faded colour, washed-out
 * edges, grain, and faint blurred background text that comes and goes. Plain WebGL2.
 *
 * Each screen appears as particles: when it reaches the middle, its image gathers from
 * scattered particles (dark ink taking on the image colours), holds, then turns into the
 * real image. When you scroll on, it turns back into particles that scatter and vanish
 * as it moves away, while the next one gathers.
 *
 * The project list on the left is plain text in Doto (dot-matrix), like the reference.
 */

const GAP = 0.3;          // space between cards, same units
const BEND_MOVE = 0.35;   // extra bend per unit of scroll speed
const TILT = 0.32;        // diagonal of the strip: next project lower-right
const WAVE_SPEED = 0.16;  // glitch wave sweeps per second (top → bottom)
const BG_TEXT = 0.2;      // how visible the background text is (0 = hidden)
const H = CARD_W / CARD_AR;
const PITCH = H + GAP;

const GATHER_S = 1.4;     // particles gathering into a screen
const HOLD_S = 0.45;      // finished particle picture holds before turning real
const REAL_S = 1.4;       // particles → real image
const GRID_W = 260;       // particles per card row (≈3px apart on a laptop screen)
const GRID_H = Math.round(GRID_W / CARD_AR);
const MAX_CARDS = 16;
const EXIT_MS = 260;      // click: labels fade and the screen calms, then the page opens
const RETURN_MS = 900;    // back from a project: the room fades back in around the screen

const LENS = `
vec2 lensFwd(vec2 q, float k){            // screen → strip
  float r2 = dot(q, q);
  return q * (1.0 + k * r2 + ${EDGE.toFixed(3)} * r2 * r2);
}
vec2 lensInv(vec2 s, float k){            // strip → screen (Newton on the radius)
  float R = length(s);
  if (R < 1e-5) return s;
  float r = R;
  for (int i = 0; i < 6; i++) {
    float r2 = r * r;
    float f = r + k * r2 * r + ${EDGE.toFixed(3)} * r2 * r2 * r - R;
    float d = 1.0 + 3.0 * k * r2 + 5.0 * ${EDGE.toFixed(3)} * r2 * r2;
    r -= f / d;
  }
  return s * (r / R);
}`;

const VERT = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 v_uv; out vec4 o;
uniform sampler2DArray u_cards;
uniform float u_n, u_scroll, u_vel, u_t, u_aspect, u_bend;
uniform float u_real[${MAX_CARDS}];
uniform vec3 u_paper;
uniform sampler2D u_bgText;   // faint background text (old-TV look)
uniform float u_bgShow;       // how visible it is right now
uniform vec2 u_mouse;         // smoothed pointer, -1..1 (parallax)
uniform float u_zoom;         // 1 = normal; larger = flying into the middle screen
uniform float u_active;       // index of the middle project
uniform float u_dark;         // 0..1: everything but the middle screen goes dark (page change)
uniform float u_clean;        // 0..1: VHS effects off on the middle screen (page change: no glitch)
uniform vec4 u_haze;          // BMO stands here (centre xy, radii xy, in q units): the picture
                              // behind it is out of focus and a little darker, for depth
float g_onActive;             // set by strip(): this point is on the middle screen
float g_band;                 // the soft glitch wave at this pixel (0..1)
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
${LENS}

// What the strip shows at strip point s: the card's colour and how "real" it is (alpha).
vec4 strip(vec2 s){
  float y = -s.y + u_scroll * ${PITCH.toFixed(4)};
  float i = floor(y / ${PITCH.toFixed(4)} + 0.5);
  float ly = y - i * ${PITCH.toFixed(4)};
  float shift = ${TILT.toFixed(3)} * (i - u_scroll) * ${PITCH.toFixed(4)};
  vec2 cuv = vec2((s.x - shift) / ${CARD_W.toFixed(4)} + 0.5, ly / ${H.toFixed(4)} + 0.5);
  g_onActive = 0.0;
  if (any(lessThan(cuv, vec2(0.0))) || any(greaterThan(cuv, vec2(1.0)))) return vec4(0.0);
  g_onActive = abs(i - u_active) < 0.5 ? 1.0 : 0.0;
  float layer = mod(i, u_n);                     // the strip loops forever
  float r = u_real[int(layer + 0.5)];
  return vec4(texture(u_cards, vec3(cuv, layer)).rgb, r);
}
// just "is there a card at strip point s" (for the shadow under it)
float stripMask(vec2 s){
  float y = -s.y + u_scroll * ${PITCH.toFixed(4)};
  float i = floor(y / ${PITCH.toFixed(4)} + 0.5);
  float ly = y - i * ${PITCH.toFixed(4)};
  float shift = ${TILT.toFixed(3)} * (i - u_scroll) * ${PITCH.toFixed(4)};
  vec2 cuv = vec2((s.x - shift) / ${CARD_W.toFixed(4)} + 0.5, ly / ${H.toFixed(4)} + 0.5);
  vec2 e = smoothstep(vec2(-0.03), vec2(0.03), cuv) * smoothstep(vec2(-0.03), vec2(0.03), 1.0 - cuv);
  return e.x * e.y * u_real[int(mod(i, u_n) + 0.5)];
}
vec3 sampleAt(vec2 q, float k){
  // parallax: the screens move with the pointer more than the background does
  vec2 s = lensFwd((q - u_mouse * ${PARALLAX.toFixed(3)}) / u_zoom, k);
  vec2 sb = lensFwd(q - u_mouse * ${(PARALLAX * 0.4).toFixed(3)}, k);
  // background: faint, blurred text drifting slowly, curved by the same lens
  vec2 tuv = vec2(sb.x * 0.22 + 0.5, -sb.y * 0.22 + 0.5 + u_scroll * 0.06);
  float txt = textureLod(u_bgText, tuv, 1.6).r;
  vec3 bg = mix(u_paper, vec3(0.62), txt * u_bgShow);
  // the card is lifted off the page: a soft shadow down and to the right
  float sh = stripMask(s + vec2(-0.05, 0.075)) * 0.6 + stripMask(s + vec2(-0.03, 0.045)) * 0.4;
  bg *= 1.0 - 0.2 * sh;
  vec4 c = strip(s);
  return mix(bg, c.rgb, c.a);
}

void main(){
  vec2 q = (v_uv * 2.0 - 1.0) * vec2(u_aspect, 1.0);
  float line = floor(v_uv.y * 360.0);
  float speed = clamp(abs(u_vel), 0.0, 1.5);
  float calm = 1.0 - u_clean;
  q.x += (noise(vec2(line * 0.15, u_t * 4.0)) - 0.5) * (0.002 + speed * 0.012) * calm;
  // a soft glitch wave sweeping from top to bottom
  float wy = 1.2 - fract(u_t * ${WAVE_SPEED.toFixed(3)}) * 1.4;
  g_band = exp(-pow((v_uv.y - wy) / 0.07, 2.0));
  q.x += g_band * 0.012 * sin(v_uv.y * 90.0 + u_t * 9.0) * calm;
  // Random TV glitches (like the project page), on lines that follow the curved glass:
  // measured in the lens-bent coordinates, so they bow with the screen.
  float cy = lensFwd(q, u_bend).y;
  float band = floor(cy * 30.0);
  float tear = step(0.987, hash(vec2(band, floor(u_t * 12.0))));
  q.x += tear * (hash(vec2(band, floor(u_t * 24.0) + 7.0)) - 0.5) * 0.12 * calm;
  float roll = fract(u_t * 0.07);
  float rb = exp(-pow((cy * 0.5 + 0.5 - (1.1 - roll * 1.2)) / 0.025, 2.0));
  q.x += rb * (noise(vec2(floor(cy * 180.0) * 0.6, u_t * 20.0)) - 0.5) * 0.03 * calm;
  float k = u_bend;
  float ca = (0.003 + g_band * 0.008 + speed * 0.012) * (0.4 + length(q)) * calm;
  vec3 col;
  col.r = sampleAt(q + vec2(ca, 0.0), k).r;
  col.g = sampleAt(q, k).g;
  float onCard = g_onActive;
  col.b = sampleAt(q - vec2(ca, 0.0), k).b;
  vec3 raw = col;
  col = mix(col, sampleAt(q + vec2(0.03, 0.0), k), 0.05);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), 0.18) * 0.96 + 0.03;
  float edge = smoothstep(0.75, 1.7, length(q * vec2(0.62, 1.0)));
  col = mix(col, vec3(1.0), edge * 0.55);
  float streak = smoothstep(0.82, 1.0, noise(vec2(q.x * 3.0 - u_t * 0.6, line * 0.9))) * 0.06;
  col -= streak * (1.0 - lum);
  col += (hash(v_uv * vec2(1920.0, 1080.0) + u_t) - 0.5) * (0.05 + speed * 0.12);
  col *= 1.0 - 0.035 * step(0.5, fract(v_uv.y * 300.0));
  // depth: behind BMO the picture is soft (a ring of taps) and in BMO's shade
  float hz = 1.0 - smoothstep(0.35, 1.0, length((q - u_haze.xy) / u_haze.zw));
  if (hz > 0.01) {
    vec3 soft = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854 + 0.39;
      soft += sampleAt(q + vec2(cos(a), sin(a)) * 0.032, k) + sampleAt(q + vec2(cos(a + 0.39), sin(a + 0.39)) * 0.016, k);
    }
    soft = mix(soft / 16.0, vec3(dot(soft / 16.0, vec3(0.299, 0.587, 0.114))), 0.35);
    col = mix(col, soft * 0.84 + 0.02, hz * 0.9);
  }
  // page change: the room goes dark around the middle screen, which stays
  col = mix(col, vec3(0.02), u_dark * (1.0 - onCard));
  // page change: the middle screen shows its plain picture, exactly as the next page will
  col = mix(col, raw, u_clean * onCard);
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// Particles for one card: each point is a spot on the card, placed through the same
// diagonal strip and lens as the picture, or scattered across the screen when not formed.
const PVERT = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 a_uv;      // spot on the card (0..1)
in vec3 a_seed;    // xy: scatter spot (-1..1), z: random 0..1
uniform sampler2DArray u_cards;
uniform float u_card, u_layer, u_scroll, u_aspect, u_bend, u_form, u_real, u_size, u_presence, u_t, u_vel, u_exit;
uniform vec2 u_mouse;
out vec4 v_col;
${LENS}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ease(float t){ return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
void main(){
  vec2 s;
  s.x = (a_uv.x - 0.5) * ${CARD_W.toFixed(4)} + ${TILT.toFixed(3)} * (u_card - u_scroll) * ${PITCH.toFixed(4)};
  s.y = u_scroll * ${PITCH.toFixed(4)} - u_card * ${PITCH.toFixed(4)} - (a_uv.y - 0.5) * ${H.toFixed(4)};
  vec2 home = lensInv(s, u_bend) + u_mouse * ${PARALLAX.toFixed(3)};
  // far from the centre the card is only loose dust: some particles drift off their spot
  home += (a_seed.xy * 0.05 + vec2(sin(u_t * 0.7 + a_seed.z * 40.0), cos(u_t * 0.6 + a_seed.z * 31.0)) * 0.012) * (1.0 - u_presence);
  // the same soft glitch wave: particles ripple sideways as it passes
  float wy = 1.2 - fract(u_t * ${WAVE_SPEED.toFixed(3)}) * 1.4;
  float tear = exp(-pow((home.y * 0.5 + 0.5 - wy) / 0.07, 2.0));
  home.x += tear * (0.018 * sin(home.y * 60.0 + u_t * 9.0) + (a_seed.x * 0.012));
  vec2 away = a_seed.xy * vec2(u_aspect, 1.0) * 1.15;
  float a = clamp(u_form * 1.5 - a_seed.z * 0.5, 0.0, 1.0);
  float e = ease(a);
  vec2 q = mix(away, home, e);
  // click: the project's particles spread across the whole screen
  float x = u_exit < 0.5 ? 4.0 * u_exit * u_exit * u_exit : 1.0 - pow(-2.0 * u_exit + 2.0, 3.0) / 2.0;
  q = mix(q, a_seed.xy * vec2(u_aspect, 1.0), x);
  gl_Position = vec4(q / vec2(u_aspect, 1.0), 0.0, 1.0);
  gl_PointSize = u_size;
  vec3 img = textureLod(u_cards, vec3(a_uv, u_layer), 0.0).rgb;
  vec3 c = mix(vec3(0.055), img, smoothstep(0.4, 1.0, a));
  // How many particles show: all near the centre, fewer and fainter further away.
  float shown = step(a_seed.z, u_presence);
  // Once the picture is real, a light glitchy particle layer stays on top of it.
  float over = 1.0 - u_real; // no particles on top once the picture is real
  v_col = vec4(c, clamp(u_form * 3.0, 0.0, 1.0) * shown * (0.25 + 0.75 * u_presence) * over * (0.12 + 0.88 * e));
  if (u_exit > 0.0) {
    // spreading particles stay visible and turn to ink, like the next page's starting cloud
    v_col = vec4(mix(c, vec3(0.055), smoothstep(0.2, 0.9, u_exit)), 1.0);
  }
}`;

const PFRAG = `#version 300 es
precision mediump float;
in vec4 v_col; out vec4 o;
void main(){ o = v_col; }`;

function program(gl: WebGL2RenderingContext, vs: string, fs: string, attrs: string[]) {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "");
  return p;
}

export default function BendShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(0);
  const exitRef = useRef<{ row: number; t: number } | null>(null);
  const [active, setActive] = useState(0);
  const glOk = useRef(false); // WebGL running: clicks spread the screen into particles
  const router = useRouter();

  // Back from a project: before the first paint, show the still the project page ended on
  // (this section with the screen in place), until our own first frame replaces it.
  const stillRef = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    try {
      const r = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null");
      const shot = homeShot();
      if (r && Date.now() - r.t < 5000 && shot && stillRef.current) {
        stillRef.current.src = shot;
        stillRef.current.style.display = "block";
        if (sectionRef.current) sectionRef.current.dataset.labels = "on"; // canvas shown at once, no fade
      }
    } catch {}
  }, []);

  // slide to project i the short way round the loop
  const goTo = (i: number) => {
    const n = projects.length, k = Math.round(targetRef.current);
    let d = i - (((k % n) + n) % n);
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    targetRef.current = k + d;
  };

  const open = useCallback((i: number) => {
    const href = `/projects/${projects[i].slug}/`;
    if (exitRef.current) return;
    if (!glOk.current) { router.push(href); return; }
    // The clicked screen stays; the labels fade, the screen calms to its plain picture,
    // then a still of this view is handed to the project page (frame loop).
    exitRef.current = { row: i, t: performance.now() };
    goRef.current = () => router.push(href);
    router.prefetch(href);
    const pre = new Image(); pre.src = projects[i].cover; pre.decode().catch(() => {});
  }, [router]);
  const goRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const section = sectionRef.current!;
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) return;
    let prog: WebGLProgram, pprog: WebGLProgram;
    try {
      prog = program(gl, VERT, FRAG, ["a_pos"]);
      pprog = program(gl, PVERT, PFRAG, ["a_uv", "a_seed"]);
    } catch (e) { console.warn("[showcase]", e); return; }
    glOk.current = true;
    const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const n = Math.min(projects.length, MAX_CARDS);

    // full-screen triangle
    const quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // particle grid (shared by every card)
    const NP = GRID_W * GRID_H;
    const uv = new Float32Array(NP * 2), seed = new Float32Array(NP * 3);
    for (let j = 0, k = 0; j < GRID_H; j++)
      for (let i = 0; i < GRID_W; i++, k++) {
        uv[k * 2] = (i + 0.5) / GRID_W; uv[k * 2 + 1] = (j + 0.5) / GRID_H;
        seed[k * 3] = Math.random() * 2 - 1; seed[k * 3 + 1] = Math.random() * 2 - 1; seed[k * 3 + 2] = Math.random();
      }
    const pVao = gl.createVertexArray();
    gl.bindVertexArray(pVao);
    const b0 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b0); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const b1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, seed, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    // covers, cropped to the card shape, in one texture array
    const TW = 1024, TH = Math.round(TW / CARD_AR);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, TW, TH, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const off = document.createElement("canvas");
    off.width = TW; off.height = TH;
    const oc = off.getContext("2d")!;
    const loaded = new Array(n).fill(false);
    // each card is the printed kraft-paper card with the project's brief (no screenshots)
    loadCardFace().then((a) => {
      projects.slice(0, n).forEach((p, i) => {
        drawCardFace(oc, a, p, i, n);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, TW, TH, 1, gl.RGBA, gl.UNSIGNED_BYTE, off);
        loaded[i] = true;
      });
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    }).catch(() => loaded.fill(true));

    // Background text: lines of the projects' own info in mono, blurred by the shader.
    const bgTex = gl.createTexture();
    {
      const bc = document.createElement("canvas");
      bc.width = 2048; bc.height = 1024;
      const bx = bc.getContext("2d")!;
      bx.fillStyle = "#000"; bx.fillRect(0, 0, 2048, 1024);
      bx.fillStyle = "#fff";
      bx.font = "600 30px ui-monospace, Menlo, monospace";
      const words = projects.flatMap((p) => [p.name.toUpperCase(), p.summary, p.stack.join(" / "), `${p.type} ${p.year}`, `/projects/${p.slug}`]);
      for (let y = 40, k = 0; y < 1024; y += 46 + (k % 3) * 10, k++) {
        let line = "";
        while (line.length < 120) line += words[(k * 7 + line.length) % words.length] + "   ";
        bx.globalAlpha = 0.35 + ((k * 37) % 10) / 15;
        bx.fillText(line, -((k * 131) % 400), y);
      }
      gl.bindTexture(gl.TEXTURE_2D, bgTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bc);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }

    let dpr = 1;
    const fit = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    fit();
    window.addEventListener("resize", fit);

    // Scrolling. The page scrolls normally until this section fills the screen; then the
    // wheel moves between projects. Scrolling up past the first project goes back up the page.
    // the projects loop forever: no ends to stop at
    const clamp = (v: number) => v;
    const wrap = (k: number) => ((k % n) + n) % n;
    const near = (i: number, c: number) => i + n * Math.round((c - i) / n); // copy of card i nearest c
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    let idle = 0;
    const consume = (dy: number) => {
      if (!atBottom()) return false;
      targetRef.current = clamp(targetRef.current + dy);
      idle = performance.now();
      return true;
    };
    const onWheel = (e: WheelEvent) => { if (consume(e.deltaY * 0.0022)) e.preventDefault(); };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      if (consume((touchY - y) * 0.005)) e.preventDefault();
      touchY = y;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!atBottom()) return;
      if (e.key === "ArrowDown") { targetRef.current = clamp(Math.round(targetRef.current) + 1); e.preventDefault(); }
      if (e.key === "ArrowUp") { targetRef.current = Math.round(targetRef.current) - 1; e.preventDefault(); }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    section.addEventListener("touchstart", onTouchStart, { passive: true });
    section.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);

    const form = new Float32Array(n), real = new Float32Array(n), fullAt = new Float32Array(n);
    const presence = new Float32Array(n);
    if (reduced) { form.fill(1); real.fill(1); presence.fill(1); }
    // Back from a project page: start on that project, zoomed in, and zoom out.
    let retAt = 0, retT = 0, retMx = 0, retMy = 0, retFilled = false;
    try {
      const r = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null");
      // removed a moment later, not now: React runs this effect twice in development
      window.setTimeout(() => { try { sessionStorage.removeItem(RETURN_KEY); } catch {} }, 1500);
      if (r && Date.now() - r.t < 5000 && r.i >= 0 && r.i < n) {
        targetRef.current = r.i; retAt = performance.now();
        setActive(r.i);
        [retMx, retMy] = homeShotMouse(); // start where the still was taken
        retFilled = true;
      }
    } catch {}
    let cur = targetRef.current, vel = 0, raf = 0, last = performance.now(), lastActive = -1, labels = "";
    const t0 = performance.now();
    const realArr = new Float32Array(MAX_CARDS);

    // pointer, eased, for the parallax
    let tx = retMx, ty = retMy, mx = retMx, my = retMy;
    const onPointer = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!reduced) { mx += (tx - mx) * 0.06; my += (ty - my) * 0.06; }
      const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20));
      last = now;
      // pinned behind the hero: progress comes from the page scroll (the ink drains away
      // between 0.38 and 0.62 of a screen and reveals this section, already in place)
      const sp = window.scrollY / window.innerHeight;
      const g = Math.min(1, Math.max(0, (sp - 0.34) / 0.3));
      const top = sp < 0.3 ? window.innerHeight * 2 : 0;
      const inView = g > 0.85;
      const lab = g > 0.7 ? "on" : "off";
      if (lab !== labels) { labels = lab; section.dataset.labels = lab; }
      if (top > window.innerHeight) return; // not on screen yet

      if (now - idle > 160) targetRef.current += (Math.round(targetRef.current) - targetRef.current) * 0.15;
      const prev = cur;
      cur += (targetRef.current - cur) * 0.09;
      vel += ((cur - prev) * 8 - vel) * 0.25;
      const ak = Math.round(cur);                  // unbounded position of the middle card
      const a = wrap(ak);                          // which project that is
      if (a !== lastActive) { lastActive = a; setActive(a); }
      const moving = Math.abs(targetRef.current - cur) > 0.03;

      // particle states per card: every card gathers once the section is in view; how many
      // of its particles show depends on its distance from the centre (presence).
      if (!reduced) for (let i = 0; i < n; i++) {
        const d = Math.abs(near(i, cur) - cur);
        presence[i] = Math.pow(Math.min(1, Math.max(0, 1 - (d - 0.3) / 1.7)), 1.6);
        const want = inView && loaded[i] && !exitRef.current && d < 0.55 ? 1 : 0;
        const gather = inView && loaded[i];
        // during a page change nothing moves: the neighbours' dust stays exactly as it is
        if (!exitRef.current) form[i] = gather ? Math.min(1, form[i] + dt / GATHER_S) : Math.max(0, form[i] - dt / 0.6);
        if (want && form[i] >= 1 && !fullAt[i]) fullAt[i] = now;
        if (!want || form[i] < 1) fullAt[i] = 0;
        if (real[i] > 0.02) fullAt[i] = fullAt[i] || now; // stays "held" while still real
        const settled = !moving || d < 0.12;
        const wantReal = want && i === a && settled && fullAt[i] && now - fullAt[i] > HOLD_S * 1000;
        real[i] = wantReal ? Math.min(1, real[i] + dt / REAL_S) : Math.max(0, real[i] - dt / 0.7);
      }
      for (let i = 0; i < n; i++) realArr[i] = real[i];

      // Click exit: real image switches to particles at once, then they spread (EXIT_MS).
      const ex = exitRef.current;
      const exiting = !!ex;
      const exitP = ex ? Math.min(1, (now - ex.t) / EXIT_MS) : 0;
      // Zoom: into the clicked screen (exit), or out of the project we came back from.
      const zoom = 1;
      const dark = 0;
      let clean = 0, snapNow = false;
      if (exiting) {
        // the clicked screen stays put; everything around it goes dark, then the project
        // page takes over with the screen at exactly this spot
        real[a] = 1; form[a] = 1; realArr[a] = 1;
        section.dataset.exit = "true";
        clean = Math.min(1, exitP * 1.4);
        if (exitP >= 1 && goRef.current) snapNow = true; // after this frame is drawn
      } else if (retAt) {
        // frame-time based (dt is capped); waits until the screen's picture is loaded
        if (loaded[a]) retT = Math.min(1, retT + dt / (RETURN_MS / 1000));
        const r = retT;
        clean = 1 - r;                                 // the screen's VHS look returns gently
        if (retFilled) { retFilled = false; form.fill(1); } // neighbours already in place: no flying dust
        real[a] = 1; form[a] = 1; realArr[a] = 1;
        fullAt[a] = now - HOLD_S * 1000 - 1; // counts as already settled, so it stays real
        if (r >= 1) retAt = 0;
      }
      section.style.setProperty("--dark", "0"); // the shader does the darkening now
      const aspect = canvas.width / canvas.height;
      const bend = BEND + Math.min(0.25, Math.abs(vel) * BEND_MOVE);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(prog);
      gl.bindVertexArray(quadVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.uniform1i(U(prog, "u_cards"), 0);
      gl.uniform1f(U(prog, "u_n"), n);
      gl.uniform1f(U(prog, "u_scroll"), cur);
      gl.uniform1f(U(prog, "u_vel"), vel);
      gl.uniform1f(U(prog, "u_t"), (now - t0) / 1000);
      gl.uniform1f(U(prog, "u_aspect"), aspect);
      gl.uniform1f(U(prog, "u_bend"), bend);
      gl.uniform1fv(U(prog, "u_real"), realArr);
      gl.uniform3f(U(prog, "u_paper"), 0.949, 0.937, 0.914);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bgTex);
      gl.uniform1i(U(prog, "u_bgText"), 1);
      // the background text is always there, faintly; a touch stronger while scrolling
      gl.uniform2f(U(prog, "u_mouse"), mx, my);
      gl.uniform1f(U(prog, "u_zoom"), zoom);
      gl.uniform1f(U(prog, "u_active"), ak);
      gl.uniform1f(U(prog, "u_dark"), dark);
      gl.uniform1f(U(prog, "u_clean"), clean);
      // where BMO stands (its box, roughly the figure inside it), in the shader's q units
      const bmo = section.querySelector<HTMLElement>(".sc__bmo");
      if (bmo) {
        const br = bmo.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
        const qx = (x: number) => ((x - cr.left) / cr.width * 2 - 1) * aspect, qy = (y: number) => 1 - ((y - cr.top) / cr.height) * 2;
        gl.uniform4f(U(prog, "u_haze"), qx(br.left + br.width * 0.5), qy(br.top + br.height * 0.52),
          (br.width * 0.42 / cr.width) * 2 * aspect, (br.height * 0.5 / cr.height) * 2);
      } else gl.uniform4f(U(prog, "u_haze"), 99, 99, 1, 1);
      gl.uniform1f(U(prog, "u_bgShow"), BG_TEXT + Math.min(1, Math.abs(vel)) * 0.08);
      gl.activeTexture(gl.TEXTURE0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // particles for every card that is (partly) formed and not yet fully real
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(pprog);
      gl.bindVertexArray(pVao);
      gl.uniform1i(U(pprog, "u_cards"), 0);
      gl.uniform1f(U(pprog, "u_scroll"), cur);
      gl.uniform1f(U(pprog, "u_aspect"), aspect);
      gl.uniform1f(U(pprog, "u_bend"), bend);
      gl.uniform1f(U(pprog, "u_size"), 2.4 * dpr);
      gl.uniform1f(U(pprog, "u_t"), (now - t0) / 1000);
      gl.uniform1f(U(pprog, "u_vel"), vel);
      gl.uniform2f(U(pprog, "u_mouse"), mx, my);
      for (let i = 0; i < n; i++) {
        if (dark > 0.01) break; // no particles during a page change
        if (form[i] <= 0.001 || presence[i] <= 0.01) continue;
        gl.uniform1f(U(pprog, "u_presence"), presence[i]);
        gl.uniform1f(U(pprog, "u_card"), near(i, cur));
        gl.uniform1f(U(pprog, "u_layer"), i);
        gl.uniform1f(U(pprog, "u_form"), form[i]);
        gl.uniform1f(U(pprog, "u_real"), real[i]);
        gl.uniform1f(U(pprog, "u_exit"), 0);
        gl.drawArrays(gl.POINTS, 0, NP);
      }
      // our first frame is up: drop the still from the project page
      if (stillRef.current && stillRef.current.style.display === "block" && loaded[a]) stillRef.current.style.display = "none";
      // hand-off: a still of exactly this frame, and where the screen is, then go
      if (snapNow && goRef.current) {
        try {
          setHomeShot(canvas.toDataURL("image/jpeg", 0.92), mx, my);
          const g = cardGrid(window.innerWidth, window.innerHeight, mx, my, bend);
          sessionStorage.setItem(CARD_KEY, JSON.stringify({ i: a, t: Date.now(), g: Array.from(g) }));
        } catch {}
        const go = goRef.current; goRef.current = null; go();
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
      window.removeEventListener("wheel", onWheel);
      section.removeEventListener("touchstart", onTouchStart);
      section.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  const p = projects[active];
  return (
    <section ref={sectionRef} className="sc" aria-labelledby="work-title">
      <noscript>
        <style>{".sc .sc__fade{opacity:1!important}"}</style>
      </noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={stillRef} className="sc__still" alt="" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="sc__canvas"
        aria-label={`${p.name}: ${p.summary}`}
        role="img"
        onClick={() => open(active)}
      />

      <header className="sc__top sc__fade">
        <a className="brand" href="#top" aria-label={`${site.name}, back to top`}>
          <KLogo />
          {site.name}
        </a>
        <span className="sc__nav">
          <TvLink className="link" href="/about/">About</TvLink>
          <a className="link" href={`mailto:${site.email}`}>
            Contact
          </a>
        </span>
      </header>
      <nav className="sc__list" aria-label="Projects">
        <h2 id="work-title" className="sc__title sc__fade">
          Selected work
        </h2>
        {/* BMO shows the current project's name on its face */}
        <div className="sc__fade">
          <BmoScreen
            show={{ no: `[${String(active + 1).padStart(2, "0")}]`, name: p.name, meta: `${p.type} · ${p.year}` }}
            onOpen={() => open(active)}
          />
        </div>
        <ol className="sc__nums">
          {projects.map((x, i) => (
            <li key={x.slug}>
              <button
                type="button"
                aria-current={i === active}
                onClick={() => (i === active ? open(i) : goTo(i))}
              >
                <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span className="sr-only">{x.name}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="sc__credit sc__fade">
          Models: BMO by <a href="https://sketchfab.com/titaniumammas69" target="_blank" rel="noopener noreferrer">object</a>, card by{" "}
          <a href={CARD_CREDIT.url} target="_blank" rel="noopener noreferrer">{CARD_CREDIT.author}</a>,{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
        </p>
      </nav>
      <p className="sc__summary sc__fade" aria-live="polite">
        <span>{p.type} · {p.year} · click to open</span>
      </p>
    </section>
  );
}
