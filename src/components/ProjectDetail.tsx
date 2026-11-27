"use client";

import { releaseGl } from "@/lib/releaseGl";
import { lightInk } from "@/lib/stage";
import { drawScreenFace } from "@/lib/screenFace";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import TvLink from "./TvLink";
import { tvOn } from "@/lib/tv";
import { projects } from "@/content/projects";
import { site } from "@/content/site";
import { particlesReady } from "@/lib/scatter";
import { BEND, CARD_AR, CARD_KEY, GRID, cardGrid, gridAt } from "@/lib/cardGrid";
import KLogo from "./KLogo";
import { homeShot } from "@/lib/snapshot";
import { bytes, loading } from "@/lib/loading";

/*
 * Project page, after fojcikdominik.com's project view. One WebGL scene:
 *   - a room behind (the project's `scene` photo in black and white, or a dark room),
 *   - three screens in a horizontal row (middle faces you, sides turn in), each a fine
 *     mesh so the picture stays straight in perspective,
 *   - all of it seen through a curved old-TV lens with scanlines, grain and line wobble.
 * The pointer turns the camera a little, so screens, room and text move against it.
 *
 * Opening: the home page hands over the clicked screen's outline (CARD_KEY). The middle
 * screen starts exactly there and eases into its slot while the room appears behind it
 * and the side screens slide out from behind; the lens curve grows in. It never vanishes.
 * Closing: the same in reverse, ending on the outline the home page will show it at.
 */

export const RETURN_KEY = "kfolio:return"; // sessionStorage: project index to come back to
const OPEN_MS = 1800;  // same as closing
const CLOSE_MS = 1800;
const LENS = 0.16;        // curved-TV strength of the final view
const FOV = 44;           // camera field of view (degrees)
const SW = 2.0;           // screen width (world units)
const SH = SW / CARD_AR;
const MESH = 24;          // mesh cells per side of a screen
const TURN_X = 0.075, TURN_Y = 0.045; // how far the pointer turns the camera

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const QUAD_VS = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// the room behind the screens
const BG_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_img; uniform float u_has, u_room, u_aspect, u_imgAspect, u_grow;
uniform float u_mono;   // 1: the photo in black and white; less for a 3D place (kept in colour)
uniform vec2 u_turn;
void main(){
  vec2 uv = v_uv;
  float zoom = 1.0 + (1.0 - u_grow) * 0.35;          // the room comes in from behind
  vec2 c = (uv - 0.5) / zoom - u_turn * vec2(0.035, 0.03);
  vec3 col;
  if (u_has > 0.5) {
    vec2 f = c;
    if (u_imgAspect > u_aspect) f.x *= u_aspect / u_imgAspect; else f.y *= u_imgAspect / u_aspect;
    vec3 img = texture(u_img, vec2(f.x + 0.5, 0.5 - f.y)).rgb;
    float l = dot(img, vec3(0.299, 0.587, 0.114));
    col = mix(img, vec3(smoothstep(0.02, 0.85, l)), u_mono);
  } else {
    // a dark room: lit walls at the sides, a pale floor, a dark ceiling
    vec2 p = c * vec2(u_aspect, 1.0);
    float walls = exp(-pow((abs(p.x) - 0.95) / 0.38, 2.0)) * smoothstep(-0.5, 0.25, p.y) * smoothstep(0.75, 0.1, p.y);
    float floorL = smoothstep(0.0, -0.5, p.y) * (0.35 - 0.18 * abs(p.x));
    float ceil = smoothstep(0.25, 0.6, p.y) * 0.04;
    col = vec3(0.05 + walls * 0.5 + floorL + ceil);
  }
  o = vec4(col * u_room, 1.0);
}`;

// a screen: positions come from the CPU (already projected), uv picks the picture
const SCR_VS = `#version 300 es
in vec2 a_pos; in vec2 a_uv; out vec2 v_uv;
void main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const SCR_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_img; uniform float u_alpha, u_flash, u_dim;
uniform sampler2D u_card; uniform float u_cardMix;   // the arcade screen's picture, glitching out
uniform float u_t;
float h1(float n){ return fract(sin(n * 91.345) * 47453.5453); }
void main(){
  // the swap is a glitch, not a fade: the screen tears into slices that flip between the
  // arcade picture and the project picture at their own moments, jump sideways, split colour
  float m = u_cardMix;
  float g = clamp(m * (1.0 - m) * 4.0, 0.0, 1.0);          // strongest half-way through
  float tk = floor(u_t * 20.0);
  float row = floor(v_uv.y * 22.0), fine = floor(v_uv.y * 90.0);
  float card = step(h1(row * 1.3 + tk * 0.37 + 0.11), m);  // m 1 → all arcade, m 0 → all picture
  float sh = (h1(fine + tk * 5.1) - 0.5) * 0.22 * g * step(0.5, h1(row + tk * 2.7));
  vec2 uv = vec2(clamp(v_uv.x + sh, 0.0, 1.0), v_uv.y);
  vec2 ca = vec2(0.014 * g, 0.0);
  vec3 pic = vec3(texture(u_img, uv + ca).r, texture(u_img, uv).g, texture(u_img, uv - ca).b);
  vec3 arc = vec3(texture(u_card, uv - ca).r, texture(u_card, uv).g, texture(u_card, uv + ca).b);
  vec3 c = mix(mix(pic, vec3(1.0), u_flash * 0.6) * u_dim, arc, card);
  // white static on a few thin lines while it tears
  float st = step(0.86, h1(fine * 0.7 + tk * 1.9)) * g;
  c = mix(c, vec3(h1(floor(v_uv.x * 160.0) + fine * 3.1 + tk)), st * 0.7);
  // thin dark bezel (the arcade picture has its own)
  float b = step(0.006, v_uv.x) * step(v_uv.x, 0.994) * step(0.01, v_uv.y) * step(v_uv.y, 0.99);
  o = vec4(mix(vec3(0.03), c, max(b, card)), u_alpha);
}`;

// the curved-TV lens and VHS finish over everything
const POST_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src; uniform float u_lens, u_aspect, u_t, u_vhs;
uniform float u_slide;  // 0..1: how fast the pictures are sliding (more glitch)
uniform sampler2D u_snap; uniform float u_hasSnap;
uniform vec4 u_mask;   // the room's opening: centre xy and half size zw (uv, y up)
uniform mat3 u_hinv;   // page uv → the home screen's own square (its 4 corners, in perspective)
uniform float u_qs;    // size of the opening in that square (1 = exactly the screen)
uniform float u_scale; // its size: <1 hidden behind the screen, large covers everything
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
vec3 at(vec2 q){
  float r2 = dot(q, q);
  vec2 s = q / (1.0 + u_lens * r2);                // barrel: the middle bulges toward you
  vec2 uv = s * vec2(1.0 / u_aspect, 1.0) * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec3(0.0);
  return texture(u_src, uv).rgb;
}
float maskAt(vec2 uv){
  // 1. the home screen's exact outline (tilted, in perspective), a little bigger as it opens
  float inQ = 0.0;
  vec3 h = u_hinv * vec3(uv, 1.0);
  if (h.z > 1e-4) {
    vec2 p = (h.xy / h.z - 0.5) * 2.0 / u_qs;
    float v = pow(pow(abs(p.x), 6.0) + pow(abs(p.y), 6.0), 1.0 / 6.0);
    inQ = 1.0 - smoothstep(0.93, 1.0, v);
  }
  // perspective runs away far from the screen: keep this shape near the screen's own box
  vec2 e = abs(uv - u_mask.xy) / (u_mask.zw * u_qs * 1.15);
  inQ *= 1.0 - smoothstep(0.92, 1.0, max(e.x, e.y));
  // 2. then a rounded box grows out of it until it covers everything
  vec2 p = (uv - u_mask.xy) / (u_mask.zw * u_scale);
  float v = pow(pow(abs(p.x), 5.0) + pow(abs(p.y), 5.0), 0.2); // 1 = the edge
  return max(inQ, 1.0 - smoothstep(0.86, 1.0, v));               // soft, feathered edge
}
void main(){
  vec2 q = (v_uv * 2.0 - 1.0) * vec2(u_aspect, 1.0) * (1.0 - u_lens * 0.18);
  // Glitch lines follow the curved TV glass: use the lens-warped position, not the flat one.
  vec2 cq = q / (1.0 + u_lens * dot(q, q));
  vec2 cuv = cq * vec2(1.0 / u_aspect, 1.0) * 0.5 + 0.5;
  float line = floor(cuv.y * 360.0);
  float frameT = floor(u_t * 24.0);                         // glitches change at 24 fps
  float g = u_vhs * (0.35 + 0.65 * u_slide);
  // slow wobble of every line
  q.x += (noise(vec2(line * 0.15, u_t * 4.0)) - 0.5) * 0.004 * u_vhs;
  // fine per-line jitter: edges fray into short horizontal streaks
  q.x += (hash(vec2(line, frameT)) - 0.5) * 0.006 * g;
  // tear bands: a few rows jump sideways for a frame or two
  float band = floor(cuv.y * 60.0);
  float tear = step(0.985 - 0.05 * u_slide, hash(vec2(band, floor(u_t * 12.0))));
  q.x += tear * (hash(vec2(band, frameT + 7.0)) - 0.5) * 0.12 * u_vhs;
  // a tracking band that rolls slowly up the picture
  float roll = fract(u_t * 0.07);
  float rb = exp(-pow((cuv.y - (1.1 - roll * 1.2)) / 0.025, 2.0));
  q.x += rb * (noise(vec2(line * 0.6, u_t * 20.0)) - 0.5) * 0.03 * u_vhs;
  float ca = (0.0025 + 0.006 * u_slide) * u_vhs * (0.5 + length(q));
  vec3 col = vec3(at(q + vec2(ca, 0.0)).r, at(q).g, at(q - vec2(ca, 0.0)).b);
  col *= 1.0 - 0.07 * step(0.5, fract(cuv.y * 300.0)) * u_vhs;
  col += (hash(v_uv * vec2(1920.0, 1080.0) + u_t) - 0.5) * 0.06 * u_vhs;
  col += rb * 0.06 * u_vhs;
  float v = smoothstep(1.7, 0.45, length(q / vec2(u_aspect * 0.9, 1.0)));
  col *= mix(1.0, 0.75 + 0.25 * v, u_vhs); // soft vignette, no black frame
  // outside the room's opening: the home page as it was when the screen was clicked
  vec3 home = u_hasSnap > 0.5 ? texture(u_snap, vec2(v_uv.x, 1.0 - v_uv.y)).rgb : vec3(0.0);
  float m = maskAt(v_uv);
  // the room blooms in: fades up from the home page's own colours near its edge
  col = mix(home, col, m * m * (3.0 - 2.0 * m));
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function program(gl: WebGL2RenderingContext, vs: string, fs: string, attrs: string[]) {
  const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? ""); return s; };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "");
  const loc = (n: string) => gl.getUniformLocation(p, n);
  return { p, loc };
}

/** Gallery entries can be videos: they play while they are the picture in front. */
const isVideo = (src: string) => /\.(mp4|webm|mov)$/i.test(src);
/** An image ready to draw: decode() where it works, plain onload where it fails (iOS can reject
 *  decode() for big in-memory pictures). Rejects only if the image itself can't load. */
const decoded = (im: HTMLImageElement) =>
  im.decode().catch(() => new Promise<void>((res, rej) => {
    if (im.complete && im.naturalWidth) { res(); return; }
    im.onload = () => res(); im.onerror = () => rej(new Error("image"));
  }));

export default function ProjectDetail({ index }: { index: number }) {
  const p = projects[index];
  const shots = [p.cover, ...(p.gallery ?? [])];
  const n = shots.length;
  const [sel, setSel] = useState(0);
  const [ready, setReady] = useState(false);
  const selRef = useRef(0);
  const targetRef = useRef(0);                        // slider target (unbounded index)
  const goRef = useRef<((k: number) => void) | null>(null); // slide to picture k
  // the viewer: a picture (or video) shown whole, uncropped, over everything
  const [view, setView] = useState<number | null>(null);
  const viewRef = useRef<number | null>(null);
  viewRef.current = view;
  const openViewRef = useRef<(k: number) => void>(() => {});
  openViewRef.current = (k: number) => setView(k);
  const closeRef = useRef<(() => void) | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLImageElement>(null);
  const router = useRouter();
  const no = (i: number) => String(i + 1).padStart(2, "0");
  const nextP = projects[(index + 1) % projects.length];

  // arriving from the previous project's "Next": glitch in (no-op otherwise)
  useLayoutEffect(() => { tvOn(rootRef.current); }, []);

  // Before the first paint: if we came from the home page, show its still (the clicked
  // screen in place) until the 3D scene draws its first frame.
  useLayoutEffect(() => {
    const img = holdRef.current;
    const shot = homeShot();
    if (!img || !shot) return;
    try {
      const h = JSON.parse(sessionStorage.getItem(CARD_KEY) ?? "null");
      if (h && h.i === index && Date.now() - h.t < 5000) { img.src = shot; img.style.display = "block"; }
    } catch {}
  }, [index]);


  useEffect(() => {
    particlesReady(); // clear any particle hand-off left over from the /lab list
    const canvas = canvasRef.current!;
    const root = rootRef.current!;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) { setReady(true); root.style.setProperty("--t", "1"); return; }
    let BG, SCR, POST;
    try {
      BG = program(gl, QUAD_VS, BG_FS, ["a_pos"]);
      SCR = program(gl, SCR_VS, SCR_FS, ["a_pos", "a_uv"]);
      POST = program(gl, QUAD_VS, POST_FS, ["a_pos"]);
    } catch (e) { console.warn("[project]", e); setReady(true); root.style.setProperty("--t", "1"); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // full-screen triangle
    const quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // screen mesh: shared uv + indices, positions per screen per frame
    const NV = (MESH + 1) * (MESH + 1);
    const uvs = new Float32Array(NV * 2);
    for (let j = 0; j <= MESH; j++) for (let i = 0; i <= MESH; i++) { const k = j * (MESH + 1) + i; uvs[k * 2] = i / MESH; uvs[k * 2 + 1] = j / MESH; }
    const idx: number[] = [];
    for (let j = 0; j < MESH; j++) for (let i = 0; i < MESH; i++) {
      const a = j * (MESH + 1) + i, b = a + 1, c = a + MESH + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const scrVao = gl.createVertexArray();
    gl.bindVertexArray(scrVao);
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, NV * 2 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    const pos = new Float32Array(NV * 2);

    // pictures: each cropped to the screen shape (top kept), like the home cards
    const TW = 1024, TH = Math.round(TW / CARD_AR);
    const texs: (WebGLTexture | null)[] = shots.map(() => null);
    const tex2d = (src: TexImageSource) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    // the home computer's screen picture (this screen leaves the computer showing it, then
    // fades into the pictures; and back again on the way home)
    let cardTex: WebGLTexture | null = null;
    // (fonts.ready can take long on a phone: never wait more than 1.5 s for it)
    Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => window.setTimeout(r, 1500))]).then(() => {
      const c = document.createElement("canvas"); c.width = TW; c.height = TH;
      drawScreenFace(c.getContext("2d")!, p, index, projects.length, { prompt: true });
      cardTex = tex2d(c);
    }).catch(() => {});
    // videos: a <video> per entry, drawn into its screen's picture every frame while it shows
    const vids: ({ el: HTMLVideoElement; c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null)[] = shots.map(() => null);
    const drawCrop = (x: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number) => {
      const s = Math.max(TW / w, TH / h);
      x.fillStyle = "#fff"; x.fillRect(0, 0, TW, TH);
      x.drawImage(src, (TW - w * s) / 2, 0, w * s, h * s);
    };
    shots.forEach((src, i) => {
      if (isVideo(src)) {
        const el = document.createElement("video");
        el.muted = true; el.loop = true; el.playsInline = true; el.preload = "auto";
        el.setAttribute("muted", ""); el.setAttribute("playsinline", "");   // iOS reads the attributes
        el.src = src;
        // iOS Safari only loads a video that is on the page and asked to play (muted inline play is
        // allowed): keep it in the page, invisible, and start it; it pauses again if not in front
        el.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
        el.setAttribute("aria-hidden", "true");
        root.appendChild(el);
        void el.play().catch(() => {});
        el.addEventListener("loadeddata", () => {
          if (i !== selRef.current) { el.pause(); el.currentTime = 0; }
          const c = document.createElement("canvas"); c.width = TW; c.height = TH;
          const g = c.getContext("2d")!;
          drawCrop(g, el, el.videoWidth, el.videoHeight);
          const t = gl.createTexture()!;
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          vids[i] = { el, c, g }; texs[i] = t;
          if (i === selRef.current) void el.play().catch(() => {});
        }, { once: true });
        return;
      }
      const img = new Image(); img.src = src;
      decoded(img).then(() => {
        const c = document.createElement("canvas"); c.width = TW; c.height = TH;
        const x = c.getContext("2d")!;
        const s = Math.max(TW / img.naturalWidth, TH / img.naturalHeight);
        x.fillStyle = "#fff"; x.fillRect(0, 0, TW, TH);
        x.drawImage(img, (TW - img.naturalWidth * s) / 2, 0, img.naturalWidth * s, img.naturalHeight * s);
        texs[i] = tex2d(c);
      }).catch(() => {});
    });
    let bgTex: WebGLTexture | null = null, bgAspect = 16 / 9;
    if (p.scene) {
      const img = new Image(); img.src = p.scene;
      img.decode().then(() => { bgTex = tex2d(img); bgAspect = img.naturalWidth / img.naturalHeight; }).catch(() => {});
    }
    // A 3D place behind (scene3d): three.js draws it on its own canvas every frame and that
    // canvas becomes the room's picture; the pointer turns the camera inside it.
    let place: { canvas: HTMLCanvasElement; tex: WebGLTexture; draw: (yaw: number, pitch: number, t: number) => void } | null = null;
    let placeStop = () => {}, placeDead = false;
    if (p.scene3d) {
      const ld = loading.add(`project:${p.slug}:scene`, 4);   // the first-load counter waits for it
      const s3 = p.scene3d;
      void (async () => {
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const gltf = await new GLTFLoader().loadAsync(s3.src, bytes(ld)).finally(() => ld(1));
        if (placeDead) return;
        const c3 = document.createElement("canvas");
        const r3 = new THREE.WebGLRenderer({ canvas: c3, antialias: false, preserveDrawingBuffer: true });
        r3.outputColorSpace = THREE.SRGBColorSpace;
        r3.toneMapping = THREE.ACESFilmicToneMapping;
        r3.toneMappingExposure = s3.exposure ?? 1.35;
        const sc3 = new THREE.Scene();
        sc3.background = new THREE.Color(0x05060c);
        if ((s3.fog ?? 0.035) > 0) sc3.fog = new THREE.FogExp2(0x05060c, s3.fog ?? 0.035);
        sc3.add(new THREE.HemisphereLight(0xb8c4ff, 0x2a2030, 1.6));
        sc3.add(gltf.scene);
        if (s3.env) {
          // shiny / metal materials need something to reflect
          const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
          const pm = new THREE.PMREMGenerator(r3);
          sc3.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
          sc3.environmentIntensity = s3.env;
          pm.dispose();
        }
        const cam = new THREE.PerspectiveCamera(s3.fov ?? 55, 16 / 9, 0.05, 200);
        const eye = new THREE.Vector3(...s3.eye), look = new THREE.Vector3(...s3.look);
        const sway = eye.distanceTo(look) * 0.006;           // in the model's own units
        cam.near = sway * 0.5; cam.far = eye.distanceTo(look) * 20; cam.updateProjectionMatrix();
        const t3 = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, t3);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        let size = "";
        place = {
          canvas: c3, tex: t3,
          draw: (yaw, pitch, t) => {
            // half resolution: it sits behind the screens, under the lens and VHS
            const k = lightInk() ? 0.35 : 0.5;
            const w = Math.max(2, Math.round(canvas.width * k)), h = Math.max(2, Math.round(canvas.height * k));
            if (size !== `${w}x${h}`) { size = `${w}x${h}`; r3.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
            // standing in the street, swaying a little; the pointer turns the head
            cam.position.set(eye.x + Math.sin(t * 0.21) * sway, eye.y + Math.sin(t * 0.37) * sway * 0.4, eye.z);
            cam.lookAt(look);
            cam.rotateY(-yaw * 3.2);
            cam.rotateX(pitch * 3.2);
            r3.render(sc3, cam);
          },
        };
        placeStop = () => { r3.dispose(); gl.deleteTexture(t3); releaseGl(c3, 0); };
      })().catch((e) => console.warn("[scene3d]", e));
    }

    // offscreen target for the lens pass
    let fbo: WebGLFramebuffer | null = null, fboTex: WebGLTexture | null = null;
    const fit = () => {
      // phones / tablets: 1.5× is plenty under the lens and VHS, and saves GPU memory
      const d = Math.min(window.devicePixelRatio || 1, lightInk() ? 1.5 : 2);
      const w = Math.round(window.innerWidth * d), h = Math.round(window.innerHeight * d);
      if (fbo && w === canvas.width && h === canvas.height) return;
      canvas.width = w; canvas.height = h;
      // the old target is freed (each mobile toolbar show / hide used to leave one behind)
      if (fbo) gl.deleteFramebuffer(fbo);
      if (fboTex) gl.deleteTexture(fboTex);
      fboTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    };
    fit();
    window.addEventListener("resize", fit);

    // where the home page left the clicked screen (fractions of the viewport)
    let start: Float32Array | null = null;
    try {
      const h = JSON.parse(sessionStorage.getItem(CARD_KEY) ?? "null");
      window.setTimeout(() => { try { sessionStorage.removeItem(CARD_KEY); } catch {} }, 1500);
      if (h && h.i === index && Date.now() - h.t < 5000) start = Float32Array.from(h.g as number[]);
    } catch {}

    // the home page's outline of the screen, as a box (uv, y up)
    const boxOf = (g: Float32Array | null): [number, number, number, number] => {
      if (!g) return [0.5, 0.5, 0.5, 0.5];
      let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
      for (let k = 0; k < g.length; k += 2) { x0 = Math.min(x0, g[k]); x1 = Math.max(x1, g[k]); y0 = Math.min(y0, g[k + 1]); y1 = Math.max(y1, g[k + 1]); }
      // centre and half size (uv, y up)
      return [(x0 + x1) / 2, 1 - (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2];
    };
    const startBox = boxOf(start);
    let endBox = startBox;
    // page uv → the screen's own unit square, from its 4 corners (a homography), so the
    // opening starts exactly as the home screen is seen (tilted, in perspective)
    const quadOf = (g: Float32Array | null, b: [number, number, number, number]) => {
      const c = g
        ? [0, GRID - 1, GRID * GRID - 1, GRID * (GRID - 1)].map((k) => [g[k * 2], 1 - g[k * 2 + 1]])
        : [[b[0] - b[2], b[1] + b[3]], [b[0] + b[2], b[1] + b[3]], [b[0] + b[2], b[1] - b[3]], [b[0] - b[2], b[1] - b[3]]];
      const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = c;   // square (0,0) (1,0) (1,1) (0,1)
      const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
      const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
      const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
      const gg = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
      const M = [x1 - x0 + gg * x1, x3 - x0 + hh * x3, x0, y1 - y0 + gg * y1, y3 - y0 + hh * y3, y0, gg, hh, 1];
      // inverse (row-major), then to column-major for GLSL
      const [a, b2, c2, d, e, f, g2, h2, i] = M;
      const A = e * i - f * h2, B = -(d * i - f * g2), C = d * h2 - e * g2;
      const det = a * A + b2 * B + c2 * C || 1e-9;
      const inv = [A, -(b2 * i - c2 * h2), b2 * f - c2 * e, B, a * i - c2 * g2, -(a * f - c2 * d), C, -(a * h2 - b2 * g2), a * e - b2 * d].map((v) => v / det);
      return new Float32Array([inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]]);
    };
    const startQuad = quadOf(start, startBox);
    let endQuad = startQuad;
    // the home page still, shown around the screen while the room grows out / shrinks back
    const shot = start ? homeShot() : null;
    let snapTex: WebGLTexture | null = null, snapFail = false;
    if (shot) {
      const im = new Image(); im.src = shot;
      decoded(im).then(() => {
        snapTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, snapTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }).catch(() => { snapFail = true; });
    }

    // pointer: the camera turns toward it, so the scene moves against it
    let tx = 0, ty = 0, mx = 0, my = 0;
    const onMove = (e: PointerEvent) => { tx = (e.clientX / window.innerWidth) * 2 - 1; ty = -((e.clientY / window.innerHeight) * 2 - 1); };
    window.addEventListener("pointermove", onMove, { passive: true });

    let lastSel = 0;
    // timeline: T goes 0 → 1 to open, 1 → 0 to close
    let T = reduced ? 1 : 0, dir = 1, goHome: (() => void) | null = null;
    let target: Float32Array | null = null;
    closeRef.current = () => {
      if (dir < 0) return;
      dir = -1;
      // back to the outline it came from (the home page restores that same view)
      target = start ?? cardGrid(window.innerWidth, window.innerHeight, 0, 0, BEND);
      endBox = boxOf(target);
      endQuad = quadOf(target, endBox);
      // the home screen shows the cover: jump to the nearest cover copy
      const cover = Math.round(slide / n) * n;
      targetRef.current = cover; slide = cover; slideV = 0;
      selRef.current = 0; setSel(0); lastSel = 0;
      try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ i: index, t: Date.now() })); } catch {}
      goHome = () => router.push("/#work");
      if (reduced) { T = 0; }
    };

    const f = 1 / Math.tan((FOV * Math.PI) / 360);
    // world point → clip space, through the turned camera
    const project = (x: number, y: number, z: number, aspect: number, yaw: number, pitch: number): [number, number] => {
      const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      const cp = Math.cos(-pitch), sp = Math.sin(-pitch);
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      return [(x1 * f) / aspect / -z2, (y2 * f) / -z2];
    };
    // Slider: `slide` follows `target` (both unbounded; picture = k mod n), pulled by
    // dragging, the wheel, arrows and thumbnails. Its speed drives the glitch.
    let slide = 0, slideV = 0, wheelAt = 0;
    const drag = { on: false, x0: 0, t0: 0, moved: false, lastX: 0, lastT: 0, v: 0 };
    const width = () => Math.max(320, window.innerWidth * 0.42); // px of drag per picture
    goRef.current = (k: number) => {
      const cur = Math.round(targetRef.current);
      const m = ((cur % n) + n) % n;
      let d = k - m;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      targetRef.current = cur + d;
    };
    const onDown = (e: PointerEvent) => {
      if (T < 1 || dir < 0 || e.button !== 0) return;
      drag.on = true; drag.moved = false; drag.x0 = drag.lastX = e.clientX; drag.t0 = targetRef.current;
      drag.lastT = performance.now(); drag.v = 0;
      canvas.setPointerCapture(e.pointerId);
    };
    const onDrag = (e: PointerEvent) => {
      if (!drag.on) return;
      const dx = e.clientX - drag.x0;
      if (Math.abs(dx) > 6) drag.moved = true;
      targetRef.current = drag.t0 - dx / width();
      const now = performance.now();
      drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
      drag.lastX = e.clientX; drag.lastT = now;
    };
    const onUp = (e: PointerEvent) => {
      if (!drag.on) return;
      drag.on = false;
      if (!drag.moved) {
        // a click: the side screens step left / right
        const x = e.clientX / window.innerWidth;
        if (n > 1 && x < 0.3) targetRef.current = Math.round(targetRef.current) - 1;
        else if (n > 1 && x > 0.7) targetRef.current = Math.round(targetRef.current) + 1;
        else openViewRef.current(selRef.current);           // the one in front: see it whole
        return;
      }
      // flick: carry on a little in the throw direction, then settle on a picture
      targetRef.current = Math.round(targetRef.current - drag.v * 0.35);
    };
    const onWheel = (e: WheelEvent) => {
      if (T < 1 || dir < 0) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      targetRef.current += d * 0.0028;
      wheelAt = performance.now();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onDrag);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0, first = true;
    // phones: the free band between the top bar (with "Next project") and the text, in clip
    // units, measured from the page (fonts and copy change its size); the middle screen fits in it
    const band = { top: 0.62, bottom: 0.05, ok: false };
    const measure = () => {
      const info = root.querySelector<HTMLElement>(".pd__info"), nx = root.querySelector<HTMLElement>(".pd__next");
      const cr = canvas.getBoundingClientRect();
      if (!info || !cr.height) return;
      const topPx = Math.max(nx ? nx.getBoundingClientRect().bottom : 0, 0) + 14;
      const botPx = info.getBoundingClientRect().top - 12;
      band.top = 1 - (2 * (topPx - cr.top)) / cr.height;
      band.bottom = 1 - (2 * (botPx - cr.top)) / cr.height;
      band.ok = band.top - band.bottom > 0.2;
    };
    measure();
    const measureT = window.setInterval(measure, 600);
    const t0 = performance.now();
    let last = t0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20));
      last = now;
      // wait for the pictures and the 3D room before opening (phones on Wi-Fi need a moment), but
      // never forever: after 4.5 s it opens with whatever is there
      const waited = now - t0;
      const notReady = !texs[selRef.current] || (shot && !snapTex && !snapFail) || (start && !cardTex) || (!!p.scene3d && !place && waited < 4000);
      if (notReady && waited < 4500 && T === 0 && dir > 0) return;
      if (!reduced) { mx += (tx - mx) * 0.06; my += (ty - my) * 0.06; }
      if (dir > 0) T = Math.min(1, T + dt / (OPEN_MS / 1000));
      else { T = Math.max(0, T - dt / (CLOSE_MS / 1000)); if (T === 0 && goHome) { const g = goHome; goHome = null; g(); } }
      // 0 → 0.6: the room grows out from behind the screen until it covers everything;
      // 0.2 → 1: the screen moves to its slot; 0.35 → 1: side screens slide out
      const grow = ease(smooth(0.05, 0.75, T));
      const e = ease(smooth(0.3, 1, T));
      // the room stays fully lit; only its opening grows / shrinks (no dark box at the edges)
      const room = 1;
      const sideIn = smooth(0.35, 1, T);
      const aspect = canvas.width / canvas.height;
      const yaw = mx * TURN_X * smooth(0.5, 1, T), pitch = my * TURN_Y * smooth(0.5, 1, T);
      root.style.setProperty("--t", smooth(0.55, 1, T).toFixed(3));
      // closing: the home page's text is already there as the room shrinks past it
      root.style.setProperty("--ghost", "0"); // closing ends inside the arcade screen: no home text yet
      root.style.setProperty("--mx", (mx * smooth(0.5, 1, T)).toFixed(4));
      root.style.setProperty("--my", (my * smooth(0.5, 1, T)).toFixed(4));
      // slider physics: a soft spring toward the target; snap after the wheel stops
      if (!drag.on && wheelAt && now - wheelAt > 180) { targetRef.current = Math.round(targetRef.current); wheelAt = 0; }
      const k1 = drag.on ? 0.5 : 0.12;
      slideV += ((targetRef.current - slide) * k1 - slideV) * 0.35;
      slide += slideV * (dt * 60);
      if (Math.abs(targetRef.current - slide) < 0.0005 && Math.abs(slideV) < 0.0005) { slide = targetRef.current; slideV = 0; }
      const speed = Math.min(1, Math.abs(slideV) * 12);
      const sNow = ((Math.round(slide) % n) + n) % n;
      if (sNow !== lastSel) {
        lastSel = sNow; selRef.current = sNow; setSel(sNow);
        // the video in front plays; the others wait (from the start next time)
        vids.forEach((v, i) => { if (!v) return; if (i === sNow) void v.el.play().catch(() => {}); else { v.el.pause(); v.el.currentTime = 0; } });
      }

      // 1. scene into the offscreen target
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(BG.p);
      gl.bindVertexArray(quadVao);
      gl.activeTexture(gl.TEXTURE0);
      if (place) {
        place.draw(yaw, pitch, now / 1000);
        gl.bindTexture(gl.TEXTURE_2D, place.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, place.canvas);
      } else gl.bindTexture(gl.TEXTURE_2D, bgTex);
      gl.uniform1i(BG.loc("u_img"), 0);
      gl.uniform1f(BG.loc("u_has"), place || bgTex ? 1 : 0);
      gl.uniform1f(BG.loc("u_mono"), place ? 0.2 : 1);
      gl.uniform1f(BG.loc("u_room"), room);
      gl.uniform1f(BG.loc("u_grow"), grow);
      gl.uniform1f(BG.loc("u_aspect"), aspect);
      gl.uniform1f(BG.loc("u_imgAspect"), place ? place.canvas.width / place.canvas.height : bgAspect);
      // a 3D place turns its own camera; a photo slides instead
      gl.uniform2f(BG.loc("u_turn"), place ? 0 : yaw / TURN_X, place ? 0 : pitch / TURN_Y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(SCR.p);
      gl.bindVertexArray(scrVao);
      gl.uniform1i(SCR.loc("u_img"), 0);
      // screens around the slide position, furthest first so the nearest is on top
      const base = Math.round(slide);
      const ks = n > 1 ? [base - 2, base + 2, base - 1, base + 1, base] : [base];
      ks.sort((A, B) => Math.abs(B - slide) - Math.abs(A - slide));
      for (const kk of ks) {
        const ki = ((kk % n) + n) % n, tex = texs[ki];
        if (!tex) continue;
        // a playing video: this frame into its screen's picture
        const v = vids[ki];
        if (v && !v.el.paused && v.el.readyState >= 2) {
          drawCrop(v.g, v.el, v.el.videoWidth, v.el.videoHeight);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v.c);
        }
        const d = kk - slide;                       // -1 left slot, 0 middle, 1 right slot
        const ad = Math.min(Math.abs(d), 1.6);
        const k = Math.abs(d) < 0.5 ? 0 : Math.sign(d);
        // narrow screens: the middle screen fits the width (92%) and sits in the upper part, clear
        // of the text below; its neighbours stay off to the sides
        // (the page's curved lens enlarges it ~25%, hence 1.15 for ~70% of the width on phones)
        let zMid = aspect < 0.8 ? Math.max(4.2, (SW * f) / (aspect * 1.6)) : 4.2;
        let lift = aspect < 1 ? 0.24 : -1;
        if (aspect < 0.62 && band.ok) {
          // fit the band: its height (less the lens's ~25% enlargement) and at most 72% of the width
          const hClip = ((band.top - band.bottom) * 0.92) / 1.25;
          zMid = Math.max((SH * f) / hClip, (SW * f) / (aspect * 1.15));
          lift = ((band.top + band.bottom) / 2) * 0.9;              // the lens pushes it out a little
        }
        const yMid = lift > -0.99 ? (lift * zMid) / f : 0.3;
        const to = { x: d * (SW + 0.3), y: yMid, z: -zMid + 0.2 * Math.min(ad, 1), yaw: Math.max(-1.6, Math.min(1.6, d)) * 0.24 };
        // side screens slide out from behind the middle one when the page opens
        const from = k === 0 ? to : { x: 0, y: yMid, z: -zMid - 1, yaw: 0 };
        const w = k === 0 ? 1 : ease(sideIn);
        const sx = from.x + (to.x - from.x) * w, sy = from.y + (to.y - from.y) * w;
        const sz = from.z + (to.z - from.z) * w, syaw = from.yaw + (to.yaw - from.yaw) * w;
        const c = Math.cos(syaw), sn = Math.sin(syaw);
        const edge = kk === base && T < 1 ? (dir < 0 ? target : start) : null;
        for (let j = 0; j <= MESH; j++) for (let i = 0; i <= MESH; i++) {
          const u = i / MESH, v = j / MESH;
          const lx = (u - 0.5) * SW, ly = (0.5 - v) * SH;
          const [px, py] = project(sx + lx * c, sy + ly, sz - lx * sn, aspect, yaw, pitch);
          let ox = px, oy = py;
          if (edge) {
            // from (or to) the home page outline: the screen travels, never disappears
            const [gx, gy] = gridAt(edge, u, v);
            ox = gx * 2 - 1 + (px - (gx * 2 - 1)) * e;
            oy = 1 - gy * 2 + (py - (1 - gy * 2)) * e;
          }
          const q = (j * (MESH + 1) + i) * 2;
          pos[q] = ox; pos[q + 1] = oy;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
        // the travelling screen starts as the arcade's screen and glitches into the picture
        // as it moves to its slot (and back again on the way home)
        const cardMix = kk === base && k === 0 && cardTex && (start || dir < 0) ? 1 - smooth(0.26, 0.52, T) : 0;
        gl.uniform1f(SCR.loc("u_t"), (now - t0) / 1000);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cardTex ?? tex);
        gl.uniform1i(SCR.loc("u_card"), 1);
        gl.uniform1f(SCR.loc("u_cardMix"), cardMix);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1f(SCR.loc("u_alpha"), (k === 0 ? 1 : sideIn) * (1 - Math.max(0, ad - 1.3) / 0.3));
        gl.uniform1f(SCR.loc("u_flash"), 0);
        gl.uniform1f(SCR.loc("u_dim"), 1 - 0.2 * Math.min(ad, 1));
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }

      // 2. lens + VHS to the screen (the curve grows in as the room arrives)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.BLEND);
      gl.useProgram(POST.p);
      gl.bindVertexArray(quadVao);
      gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.uniform1i(POST.loc("u_src"), 0);
      gl.uniform1f(POST.loc("u_lens"), LENS * e);
      gl.uniform1f(POST.loc("u_aspect"), aspect);
      gl.uniform1f(POST.loc("u_t"), (now - t0) / 1000);
      gl.uniform1f(POST.loc("u_slide"), speed);
      gl.uniform1f(POST.loc("u_vhs"), e);
      // the opening grows from the screen's outline (home side) to past the screen edges
      const box = dir < 0 ? endBox : startBox;
      gl.uniform4f(POST.loc("u_mask"), box[0], box[1], box[2], box[3]);
      // 0.9: tucked just inside the screen's edge → 3.2: well past the screen corners
      // big enough at the end to cover every corner (a small start screen needs more)
      const ax = Math.max(box[0], 1 - box[0]) / Math.max(1e-3, box[2]), ay = Math.max(box[1], 1 - box[1]) / Math.max(1e-3, box[3]);
      const cover = Math.max(3.4, (Math.pow(ax, 5) + Math.pow(ay, 5)) ** 0.2 / 0.84 * 1.08);
      // the box starts tucked well inside the screen (so the opening is the screen's own shape)
      gl.uniform1f(POST.loc("u_scale"), 0.3 + Math.pow(grow, 2.4) * (cover - 0.3));
      gl.uniformMatrix3fv(POST.loc("u_hinv"), false, dir < 0 ? endQuad : startQuad);
      gl.uniform1f(POST.loc("u_qs"), 0.97 + grow * 1.3);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, snapTex);
      gl.uniform1i(POST.loc("u_snap"), 1);
      gl.uniform1f(POST.loc("u_hasSnap"), snapTex ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (first) { first = false; setReady(true); }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); window.clearInterval(measureT);
      vids.forEach((v) => { if (v) { v.el.pause(); v.el.removeAttribute("src"); v.el.load(); v.el.remove(); } });
      placeDead = true; placeStop(); releaseGl(canvas);
      window.removeEventListener("resize", fit);
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onDrag);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // arrow keys switch screens, Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewRef.current !== null) {
        if (e.key === "Escape") setView(null);
        if (e.key === "ArrowRight") { const k = (viewRef.current + 1) % n; setView(k); goRef.current?.(k); }
        if (e.key === "ArrowLeft") { const k = (viewRef.current - 1 + n) % n; setView(k); goRef.current?.(k); }
        return;
      }
      if (e.key === "ArrowRight") targetRef.current = Math.round(targetRef.current) + 1;
      if (e.key === "ArrowLeft") targetRef.current = Math.round(targetRef.current) - 1;
      if (e.key === "Escape") closeRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);

  const close = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    closeRef.current?.();
  };
  return (
    <main ref={rootRef} className="pd" data-ready={ready}>
      <canvas ref={canvasRef} className="pd__canvas" aria-label={`${p.name}, picture ${sel + 1} of ${n}`} role="img" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={holdRef} className="pd__hold" alt="" aria-hidden="true" />

      {/* the home showcase's text, in the same places (fades in while closing) */}
      <div className="sc sc--ghost" data-labels="on" aria-hidden="true">
        <header className="sc__top sc__fade">
          <span className="brand"><KLogo />{site.name}</span>
        </header>
        <div className="sc__list">
          <div className="sc__menu sc__fade">
            <p className="sc__title">Menu</p>
            <ul className="sc__menu-list">
              <li><span className="sc__menu-link">About</span></li>
              <li><span className="sc__menu-link">Contact us</span></li>
              <li><span className="sc__menu-link">Resume ↗</span></li>
            </ul>
          </div>
        </div>
        <p className="sc__summary sc__fade">
          <span>Click to open · scroll to change</span>
        </p>
      </div>

      <header className="pd__top pd__hud">
        <Link className="brand" href="/">
          <KLogo />
          {site.name}
        </Link>
        <Link className="pd__close" href="/#work" onClick={close}>
          <span aria-hidden="true">&gt;</span> Close <span aria-hidden="true">&lt;</span>
        </Link>
        <span className="pd__count">{no(index)} / {no(projects.length - 1)}</span>
      </header>

      <section className="pd__info pd__hud" aria-labelledby="pd-name">
        <div>
          <h2 className="pd__label">Project</h2>
          <h1 id="pd-name" className="pd__name">{p.name}</h1>
          {p.context && <p className="pd__context">{p.context}</p>}
        </div>
        <div>
          <h2 className="pd__label">Info</h2>
          <p className="pd__text">{p.summary}</p>
          {p.story && <p className="pd__story">{p.story}</p>}
          {(p.links?.live || p.links?.code) && (
            <p className="pd__links">
              {p.links?.live && <a href={p.links.live} target="_blank" rel="noopener noreferrer">Live ↗</a>}
              {p.links?.code && <a href={p.links.code} target="_blank" rel="noopener noreferrer">Code ↗</a>}
            </p>
          )}
        </div>
        <div>
          <h2 className="pd__label">Built with</h2>
          <ul className="pd__text pd__built">
            {p.stack.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
        <ol className="pd__thumbs" aria-label="Pictures">
          {shots.map((s, k) => (
            <li key={s}>
              <button type="button" aria-current={k === sel} onClick={() => goRef.current?.(k)} aria-label={`${isVideo(s) ? "Video" : "Picture"} ${k + 1}`}>
                {isVideo(s)
                  ? <video src={s} muted playsInline preload="metadata" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={s} alt="" />}
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* straight to the next project (loops), through the glitch page switch */}
      <TvLink className="pd__next pd__hud" href={`/projects/${nextP.slug}/`}>
        <span className="pd__next-label">Next project <span className="pd__next-arrow" aria-hidden="true">▸</span></span>
        <span className="pd__next-name">{nextP.name}</span>
      </TvLink>

      {/* the viewer: the picture whole (the screens crop it to their curved shape) */}
      {view !== null && (
        <div className="pd__viewer" role="dialog" aria-modal="true" aria-label={`${p.name}, ${view + 1} of ${n}`} onClick={() => setView(null)}>
          {isVideo(shots[view])
            ? <video key={shots[view]} src={shots[view]} autoPlay loop muted playsInline controls onClick={(e) => e.stopPropagation()} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img key={shots[view]} src={shots[view]} alt={`${p.name}, picture ${view + 1}`} onClick={(e) => e.stopPropagation()} />}
          {n > 1 && (
            <>
              <button type="button" className="pd__viewer-prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); const k = (view - 1 + n) % n; setView(k); goRef.current?.(k); }}>‹</button>
              <button type="button" className="pd__viewer-next" aria-label="Next" onClick={(e) => { e.stopPropagation(); const k = (view + 1) % n; setView(k); goRef.current?.(k); }}>›</button>
            </>
          )}
          <p className="pd__viewer-count">{no(view)} / {no(n - 1)}</p>
          <button type="button" className="pd__viewer-close" onClick={() => setView(null)}>&gt; Close &lt;</button>
        </div>
      )}
    </main>
  );
}
