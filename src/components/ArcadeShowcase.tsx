"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { projects } from "@/content/projects";
import { site } from "@/content/site";
import { RETURN_KEY } from "./ProjectDetail";
import { BEND, CARD_KEY, GRID, lensInv } from "@/lib/cardGrid";
import { homeShot, homeShotMouse, setHomeShot } from "@/lib/snapshot";
import { drawKFace, drawScreenFace } from "@/lib/screenFace";
import { floodOrigin, snap } from "@/lib/stage";
import { LABEL, TEX, drawCardLabel, projectCard } from "@/lib/cardLabel";
import { arcadeGames } from "@/content/arcadeGames";
import { drawGameArt } from "@/lib/gameArt";
import { music } from "@/lib/music";
import { bytes, loading } from "@/lib/loading";
import { ABOUT_FILES, prefetch } from "@/lib/prefetch";
import KLogo from "./KLogo";
import TvLink from "./TvLink";
import { glitchJump } from "@/lib/tv";

/*
 * Home page project section (second screen, under the ink K).
 *
 * The top half of an arcade cabinet ("Final Fight Arcade" by brysew, CC BY 4.0), seen from
 * its left like a photo, shows the current project's name on its screen as an attract
 * screen. On the right, game cards ("DS game card" by maney, CC BY 4.0, label repainted per
 * project with its description) sit on a wheel; scrolling turns the wheel one card at a
 * time, the arcade screen glitches to the next name. Everything goes through the site's
 * curved-TV finish over the paper.
 *
 * Click a card (or the screen): the screen calms, a still of this view and the arcade
 * screen's outline go to the project page, whose room grows out from behind that screen.
 */

/* Opening a project: the arcade errors (shakes, the screen glitches with ERROR), then the
   camera is pulled into its screen until the screen fills the view; the project page starts
   from exactly that. Coming back: the reverse, out of the screen. */
const SHAKE_MS = 520;         // the error shake
const DIVE_MS = 950;          // pulled into the screen (starts as the shake fades)
const OUT_MS = 1150;          // back out of the screen, on return
const CHANGE_S = 0.5;         // channel change glitch
const BG_TEXT = 0.2;          // background text visibility

const POST_VS = `
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = `
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
uniform sampler2D tScene, tText;
uniform vec3 uPaper, uTextCol, uEdgeCol;   // the paper, the faint drifting text, the edge wash
uniform float uT, uAspect, uClean, uBend, uDrift, uKick, uOver;
uniform sampler2D tCards;          // the game cards: drawn flat over the bent scene
uniform sampler2D tInk; uniform float uInk;   // the home page's ink, behind the arcade
uniform sampler2D tBack;           // cards with 90s arcade games floating behind everything
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
vec2 lensFwd(vec2 q, float k){ float r2 = dot(q, q); return q * (1.0 + k * r2 + 0.11 * (k / ${BEND.toFixed(3)}) * r2 * r2); }  // flat when k = 0
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec4 sceneAt(vec2 s){
  vec2 uv = vec2(s.x / uAspect / uOver * 0.5 + 0.5, s.y / uOver * 0.5 + 0.5);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
  return texture(tScene, uv);
}
void main(){
  vec2 q = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  float calm = 1.0 - uClean;
  float line = floor(vUv.y * 360.0);
  q.x += (noise(vec2(line * 0.15, uT * 4.0)) - 0.5) * (0.002 + uKick * 0.02) * calm;
  vec2 s = lensFwd(q, uBend);
  float band = floor(s.y * 30.0);
  float tear = step(0.987 - uKick * 0.08, hash(vec2(band, floor(uT * 12.0))));
  s.x += tear * (hash(vec2(band, floor(uT * 24.0) + 7.0)) - 0.5) * 0.12 * calm;
  float roll = fract(uT * 0.07);
  float rb = exp(-pow((s.y * 0.5 + 0.5 - (1.1 - roll * 1.2)) / 0.025, 2.0));
  float shift = tear * (hash(vec2(band, floor(uT * 24.0) + 7.0)) - 0.5) * 0.12 * calm;
  s.x += rb * (noise(vec2(floor(s.y * 180.0) * 0.6, uT * 20.0)) - 0.5) * 0.03 * calm;
  // the cards get the same glitch shifts, but no lens: they can run off the screen anywhere
  vec2 cq = q + vec2(shift + rb * (noise(vec2(floor(s.y * 180.0) * 0.6, uT * 20.0)) - 0.5) * 0.03 * calm, 0.0);
  vec2 cuv = vec2(cq.x / uAspect * 0.5 + 0.5, cq.y * 0.5 + 0.5);
  // paper with faint drifting text, then the scene (premultiplied, linear) over it
  vec2 tuv = vec2(s.x * 0.22 + 0.5, s.y * 0.22 + 0.5 - uDrift);   // canvas textures are flipped
  float txt = texture(tText, tuv, 1.6).r;
  vec3 bg = lin(mix(uPaper, uTextCol, txt * ${BG_TEXT.toFixed(2)}));
  vec4 kbk = texture(tBack, cuv);
  bg = bg * (1.0 - kbk.a) + kbk.rgb * 0.9;           // a little faded into the paper
  // the ink floods the page behind the arcade (it has its own TV curve already)
  vec4 ik = texture(tInk, vUv);
  float ia = ik.a * uInk;
  bg = mix(bg, lin(ik.rgb), ia);
  float ca = (0.002 + uKick * 0.006) * (0.4 + length(q)) * calm;
  vec4 c = sceneAt(s);
  vec3 col = bg * (1.0 - c.a) + c.rgb;
  vec4 cr = sceneAt(s + vec2(ca, 0.0)), cb = sceneAt(s - vec2(ca, 0.0));   // colour bleed
  col.r = (bg * (1.0 - cr.a) + cr.rgb).r;
  col.b = (bg * (1.0 - cb.a) + cb.rgb).b;
  vec4 k0 = texture(tCards, cuv), kr = texture(tCards, cuv + vec2(ca * 0.5, 0.0)), kb = texture(tCards, cuv - vec2(ca * 0.5, 0.0));
  col = vec3(col.r * (1.0 - kr.a) + kr.r, col.g * (1.0 - k0.a) + k0.g, col.b * (1.0 - kb.a) + kb.b);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  // faded colour, washed-out edges, grain, scanlines, the rolling band's glow
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), 0.12) * 0.97 + 0.025;
  float edge = smoothstep(0.75, 1.7, length(q * vec2(0.62, 1.0)));
  col = mix(col, uEdgeCol, edge * 0.5 * (1.0 - ia) * calm);
  col += (hash(vUv * vec2(1920.0, 1080.0) + uT) - 0.5) * (0.05 + uKick * 0.08);
  col *= 1.0 - 0.035 * step(0.5, fract(vUv.y * 300.0));
  col += rb * 0.02;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/** lensInv with the edge term scaled like the shader's (so k = 0 is perfectly flat). */
function lensInvK(x: number, y: number, k: number): [number, number] {
  if (k >= BEND - 1e-6) return lensInv(x, y, k);
  const E = 0.11 * (k / BEND), R = Math.hypot(x, y);
  if (R < 1e-6 || k <= 0) return [x, y];
  let r = R;
  for (let i = 0; i < 8; i++) { const r2 = r * r; r -= (r + k * r2 * r + E * r2 * r2 * r - R) / (1 + 3 * k * r2 + 5 * E * r2 * r2); }
  return [(x * r) / R, (y * r) / R];
}

/** Point on a mesh at texture coordinate (u, v), by barycentric search over its triangles. */
function pointAtUv(pos: ArrayLike<number>, uv: ArrayLike<number>, idx: ArrayLike<number> | null, u: number, v: number) {
  const n = idx ? idx.length : pos.length / 3;
  const at = (k: number) => (idx ? idx[k] : k);
  let best: [number, number, number] | null = null, bestD = Infinity;
  for (let k = 0; k + 2 < n; k += 3) {
    const a = at(k), b = at(k + 1), c = at(k + 2);
    const x1 = uv[a * 2], y1 = uv[a * 2 + 1], x2 = uv[b * 2], y2 = uv[b * 2 + 1], x3 = uv[c * 2], y3 = uv[c * 2 + 1];
    const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((y2 - y3) * (u - x3) + (x3 - x2) * (v - y3)) / d;
    const l2 = ((y3 - y1) * (u - x3) + (x1 - x3) * (v - y3)) / d;
    const l3 = 1 - l1 - l2;
    const out = Math.max(0, -l1) + Math.max(0, -l2) + Math.max(0, -l3);   // 0 when inside
    if (out < bestD) {
      bestD = out;
      const w1 = Math.max(0, l1), w2 = Math.max(0, l2), w3 = Math.max(0, l3), s = w1 + w2 + w3 || 1;
      best = [0, 1, 2].map((q) => (pos[a * 3 + q] * w1 + pos[b * 3 + q] * w2 + pos[c * 3 + q] * w3) / s) as [number, number, number];
      if (out === 0) break;
    }
  }
  return best ?? [0, 0, 0];
}

const CARD_STEP = 0.56;
/* The lens pushes the picture's edges outward, so the scene is rendered over a wider area
   (OVER × the screen) and things near the edges really run off the screen. */
const OVER = 1.5;       // radians between cards on the arc

type T3 = typeof import("three");
type Mesh = import("three").Mesh;
type Obj = import("three").Object3D;

/**
 * The game card model, turned so its label faces +z with the label's top up, 1 unit tall,
 * and which way the label is stored in the texture (the label is painted over per project).
 */
function prepareCard(THREE: T3, scene: Obj) {
  let mesh: Mesh | null = null;
  scene.traverse((o) => { if ((o as Mesh).isMesh && !mesh) mesh = o as Mesh; });
  const m = mesh! as Mesh;
  scene.updateMatrixWorld(true);
  // bake the node transforms into the geometry, so the card is one plain mesh
  const geo = m.geometry.clone();
  geo.applyMatrix4(m.matrixWorld);
  const P = geo.getAttribute("position"), UV = geo.getAttribute("uv");
  const I = geo.getIndex();
  const cnt = I ? I.count : P.count;
  const at = (k: number) => (I ? I.getX(k) : k);
  const N = new THREE.Vector3(), Tu = new THREE.Vector3(), Tv = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let k = 0; k + 2 < cnt; k += 3) {
    const i0 = at(k), i1 = at(k + 1), i2 = at(k + 2);
    const cu = (UV.getX(i0) + UV.getX(i1) + UV.getX(i2)) / 3 * 1024, cv = (UV.getY(i0) + UV.getY(i1) + UV.getY(i2)) / 3 * 1024;
    if (cu < LABEL.x0 + 20 || cu > LABEL.x1 - 20 || cv < LABEL.y0 + 20 || cv > LABEL.y1 - 20) continue;
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    e1.subVectors(b, a); e2.subVectors(c, a);
    const n = new THREE.Vector3().crossVectors(e1, e2);
    if (n.lengthSq() < 1e-12) continue;
    N.add(n);
    // texture-space gradients: which 3D direction image-x and image-y grow in
    const du1 = UV.getX(i1) - UV.getX(i0), dv1 = UV.getY(i1) - UV.getY(i0), du2 = UV.getX(i2) - UV.getX(i0), dv2 = UV.getY(i2) - UV.getY(i0);
    const r = du1 * dv2 - du2 * dv1;
    if (Math.abs(r) < 1e-12) continue;
    Tu.add(e1.clone().multiplyScalar(dv2).sub(e2.clone().multiplyScalar(dv1)).divideScalar(r));
    Tv.add(e2.clone().multiplyScalar(du1).sub(e1.clone().multiplyScalar(du2)).divideScalar(r));
  }
  N.normalize();
  // the label's top is where image-y gets smaller (image rows run downwards)
  const up = Tv.clone().negate();
  up.sub(N.clone().multiplyScalar(up.dot(N))).normalize();
  const right = new THREE.Vector3().crossVectors(up, N).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, N).invert();
  geo.applyMatrix4(basis);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!, size = bb.getSize(new THREE.Vector3()), mid = bb.getCenter(new THREE.Vector3());
  geo.translate(-mid.x, -mid.y, -mid.z);
  geo.scale(1 / size.y, 1 / size.y, 1 / size.y);
  geo.computeVertexNormals();
  // image-x should run to the right; if it runs left, the label is stored mirrored
  const flipX = Tu.dot(right) < 0;
  return { geo, material: m.material as import("three").MeshStandardMaterial, flipX };
}

/** Where the "K+S" sits, in the arcade's texture (u, v): the panel's bottom-right corner. */
const KS_UV: [number, number] = [0.5852, 0.2045];

/** A point on `mesh` at texture coordinate (u, v), facing the front (+z) the most: position,
 *  outward normal, and the 3D directions u and v grow in (world space). */
function surfaceAtUv(THREE: T3, mesh: Mesh, u: number, v: number) {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry, P = g.getAttribute("position"), UV = g.getAttribute("uv"), NR = g.getAttribute("normal");
  const I = g.getIndex(), cnt = I ? I.count : P.count, at = (k: number) => (I ? I.getX(k) : k);
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  let best: { p: import("three").Vector3; n: import("three").Vector3; tu: import("three").Vector3; tv: import("three").Vector3 } | null = null;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let k = 0; k + 2 < cnt; k += 3) {
    const a = at(k), b = at(k + 1), c = at(k + 2);
    const x1 = UV.getX(a), y1 = UV.getY(a), x2 = UV.getX(b), y2 = UV.getY(b), x3 = UV.getX(c), y3 = UV.getY(c);
    const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((y2 - y3) * (u - x3) + (x3 - x2) * (v - y3)) / d, l2 = ((y3 - y1) * (u - x3) + (x1 - x3) * (v - y3)) / d, l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    A.fromBufferAttribute(P, a).applyMatrix4(mesh.matrixWorld); B.fromBufferAttribute(P, b).applyMatrix4(mesh.matrixWorld); C.fromBufferAttribute(P, c).applyMatrix4(mesh.matrixWorld);
    const n = new THREE.Vector3().fromBufferAttribute(NR, a).multiplyScalar(l1)
      .add(new THREE.Vector3().fromBufferAttribute(NR, b).multiplyScalar(l2))
      .add(new THREE.Vector3().fromBufferAttribute(NR, c).multiplyScalar(l3)).applyMatrix3(nm).normalize();
    if (best && n.z <= best.n.z) continue;
    const p = A.clone().multiplyScalar(l1).add(B.clone().multiplyScalar(l2)).add(C.clone().multiplyScalar(l3));
    const e1 = B.clone().sub(A), e2 = C.clone().sub(A);
    const du1 = x2 - x1, dv1 = y2 - y1, du2 = x3 - x1, dv2 = y3 - y1, r = du1 * dv2 - du2 * dv1;
    const tu = e1.clone().multiplyScalar(dv2).sub(e2.clone().multiplyScalar(dv1)).divideScalar(r);
    const tv = e2.clone().multiplyScalar(du1).sub(e1.clone().multiplyScalar(du2)).divideScalar(r);
    best = { p, n, tu, tv };
  }
  return best;
}

/** "K+S", small, in red marker (with a soft glow), on a 320 × 128 transparent canvas. */
function drawKS(g: CanvasRenderingContext2D) {
  const S = 320 / 71;
  const k = 128 / 28;
  g.lineCap = "round"; g.lineJoin = "round";
  const strokes = (ctx: CanvasRenderingContext2D) => {
    const line = (pts: number[][]) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * S, y * k) : ctx.moveTo(x * S, y * k))); ctx.stroke(); };
    line([[6.5, 5], [6.8, 14], [6.5, 23]]);
    line([[16.5, 5.5], [12, 11], [7.5, 14]]); line([[9, 13], [13.5, 18.5], [17.5, 23]]);
    line([[26.5, 14.5], [37, 14]]); line([[31.9, 9], [31.6, 19.5]]);
    const s: number[][] = [];
    for (let t = 30; t <= 270; t += 12) s.push([50.5 + 5.8 * Math.cos((t * Math.PI) / 180), 9.6 - 4.8 * Math.sin((t * Math.PI) / 180)]);
    for (let t = 90; t >= -150; t -= 12) s.push([50.5 + 5.8 * Math.cos((t * Math.PI) / 180), 18.8 - 4.8 * Math.sin((t * Math.PI) / 180)]);
    line(s);
  };
  g.strokeStyle = "rgba(150, 18, 28, 0.55)"; g.lineWidth = 2.6 * S * 1.9; g.filter = "blur(6px)"; strokes(g);
  g.filter = "none"; g.strokeStyle = "#c41820"; g.lineWidth = 2.4 * S; strokes(g);
}

/* Card hover: the label breaks into coloured pixel water (rippling, rainbow-tinted, with
   glitch slices and colour split). Replaces three's map_fragment; uHover 0..1 eases in. */
const CARD_FX = `
#ifdef USE_MAP
  vec2 uvm = vMapUv;
  float b = uBurst;                       // 1 → 0 once, when the hover starts: the splash
  vec2 cell = uvm;
  if (b > 0.001) {
    float px = mix(560.0, 200.0, b);
    cell = (floor(uvm * px) + 0.5) / px;
    float t = uTime;
    vec2 rip = vec2(sin(cell.y * 190.0 + t * 9.0), cos(cell.x * 170.0 + t * 8.0)) * 0.0018 * b;
    float row = floor(uvm.y * 120.0);
    float on = step(0.7, fract(sin(row * 12.9898 + floor(t * 30.0) * 7.1) * 43758.5453));
    float jump = (fract(sin(row * 78.233 + floor(t * 30.0)) * 9187.13) - 0.5) * 0.03 * on * b;
    uvm = mix(uvm, cell + rip + vec2(jump, 0.0), min(1.0, b * 1.6));
  }
  vec4 sampledDiffuseColor = texture2D(map, uvm);
  if (b > 0.001) {
    float ca = 0.005 * b;
    sampledDiffuseColor.r = texture2D(map, uvm + vec2(ca, 0.0)).r;
    sampledDiffuseColor.b = texture2D(map, uvm - vec2(ca, 0.0)).b;
  }
  if (uHover > 0.001) {
    // then a coat of colour that moves like water: soft rainbow bands drifting across, applied
    // as a tint (multiply), so light text stays light and the brief stays readable
    vec2 q = vMapUv;
    float t = uTime;
    float w = 0.5 + 0.5 * sin(q.x * 48.0 + sin(q.y * 36.0 + t * 1.2) * 2.2 - t * 1.4);
    vec3 hue = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + q.x * 1.6 + q.y * 1.1 + t * 0.12));
    vec3 coat = sampledDiffuseColor.rgb * (0.5 + 1.0 * hue) + hue * 0.1 * w;   // tint + a soft sheen
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, coat, uHover * (0.7 + 0.3 * w));
  }
  diffuseColor *= sampledDiffuseColor;
#endif`;

export default function ArcadeShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(0);
  const exitRef = useRef<{ row: number; t: number } | null>(null);
  const goRef = useRef<(() => void) | null>(null);
  const [active, setActive] = useState(0);
  const glOk = useRef(false);
  const router = useRouter();

  // Back from a project: show the still the project page ended on until our first frame.
  const stillRef = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    try {
      const r = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null");
      const shot = homeShot();
      if (r && Date.now() - r.t < 5000 && shot && stillRef.current) {
        stillRef.current.src = shot;
        stillRef.current.style.display = "block";
        if (sectionRef.current) { sectionRef.current.dataset.labels = "on"; sectionRef.current.dataset.calm = "on"; }
      }
    } catch {}
  }, []);

  // to project i the short way round the loop
  const goTo = (i: number) => {
    const n = projects.length, k = Math.round(targetRef.current);
    let d = i - (((k % n) + n) % n);
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    targetRef.current = k + d;
    if (d) music.tick();                                    // the wheel turns: a ratchet
  };
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  const open = useCallback((i: number) => {
    const href = `/projects/${projects[i].slug}/`;
    if (exitRef.current) return;
    music.openProject();                                   // "Round": the fight is on
    if (!glOk.current) { router.push(href); return; }
    exitRef.current = { row: i, t: performance.now() };
    goRef.current = () => router.push(href);
    router.prefetch(href);
    const pre = new Image(); pre.src = projects[i].cover; pre.decode().catch(() => {});
  }, [router]);
  const activeRef = useRef(0);
  activeRef.current = active;
  // resting on a project for a moment: fetch its 3D room in the background (opens faster)
  useEffect(() => {
    const t = window.setTimeout(() => prefetch(projects[active].scene3d?.src), 700);
    return () => window.clearTimeout(t);
  }, [active]);

  useEffect(() => {
    const section = sectionRef.current!;
    // the first-load counter waits for these (registered now, before anything async)
    const ldArcade = loading.add("home:arcade", 4), ldCard = loading.add("home:card", 1);
    const ldCovers = loading.add("home:covers", 1), ldFrame = loading.add("home:frame", 1);
    let framed = false;
    const canvas = canvasRef.current!;
    let stop = () => {}, dead = false;
    const n = projects.length;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Scrolling: the page scrolls normally until this section fills the screen; then the
    // wheel turns the card wheel one project at a time. The projects loop forever.
    const wrap = (k: number) => ((k % n) + n) % n;
    const near = (i: number, c: number) => i + n * Math.round((c - i) / n);
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    // One project per swipe. A trackpad keeps sending wheel events (momentum) for a second or
    // more after a flick, so after a step the wheel locks until either the events pause
    // (140 ms by their own timestamps) or a clearly NEW push arrives once the swipe has faded
    // (below 40% of its peak since the step): an event over 2.5× the average of the last few.
    // A swipe's own ramp-up and a momentum tail's small bumps never count (both moved two
    // cards before). Steps are at least 300 ms apart; a short push (20 px) is enough.
    const step = (d: number) => { targetRef.current = Math.round(targetRef.current) + d; music.tick(); };
    const STEP_GAP = 300, PUSH = 20;
    let acc = 0, lastWheel = -1e9, locked = false, steppedAt = -1e9, peak = 0;
    const recent: number[] = [];
    const onWheel = (e: WheelEvent) => {
      const at = e.timeStamp, dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, ady = Math.abs(dy);
      const quiet = at - lastWheel > 140;
      lastWheel = at;
      if (quiet) recent.length = 0;                          // a new gesture: forget the old one
      const avg = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
      recent.push(ady); if (recent.length > 4) recent.shift();
      if (!atBottom()) { locked = true; acc = 0; return; }   // the page scroll's tail never steps
      e.preventDefault();
      // (the peak before this event: a jump can't count against itself)
      const fresh = locked && performance.now() - steppedAt > 250 && avg < peak * 0.4 && ady > 14 && ady > avg * 2.5;
      if (locked) peak = Math.max(peak, ady);
      if (quiet || fresh) { locked = false; acc = 0; }
      if (locked || performance.now() - steppedAt < STEP_GAP) return;
      acc += dy;
      if (Math.abs(acc) > PUSH) { step(Math.sign(acc)); acc = 0; locked = true; steppedAt = performance.now(); peak = ady; }
    };
    const dragState = { on: false };
    let touchY = 0, touchX = 0, touchDone = false;
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY; touchX = e.touches[0].clientX; touchDone = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (!atBottom() || dragState.on) return;
      if (touchDone) { e.preventDefault(); return; }                         // one step per swipe
      const y = e.touches[0].clientY, x = e.touches[0].clientX;
      e.preventDefault();
      const d = Math.abs(touchY - y) > Math.abs(touchX - x) ? touchY - y : touchX - x;
      if (Math.abs(d) > 50) { step(Math.sign(d)); touchDone = true; }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!atBottom()) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { step(1); e.preventDefault(); }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
      if (e.key === "Enter" && document.activeElement === document.body) open(activeRef.current);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    section.addEventListener("touchstart", onTouchStart, { passive: true });
    section.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);

    // back from a project page: start on it, same pointer, no glitch
    let back = false, tx = 0, ty = 0;
    try {
      const r = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null");
      window.setTimeout(() => { try { sessionStorage.removeItem(RETURN_KEY); } catch {} }, 1500);
      if (r && Date.now() - r.t < 5000 && r.i >= 0 && r.i < n) {
        targetRef.current = r.i; setActive(r.i); back = true;
        [tx, ty] = homeShotMouse();
      }
    } catch {}
    let mx = tx, my = ty;
    let ptrOn = false;                                     // the pointer is over the page
    const onPointer = (e: PointerEvent) => { tx = (e.clientX / innerWidth) * 2 - 1; ty = -((e.clientY / innerHeight) * 2 - 1); ptrOn = e.pointerType === "mouse" || e.pointerType === "pen"; };
    const onLeave = () => { ptrOn = false; };
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointermove", onPointer, { passive: true });

    void (async () => {
      const [THREE, { GLTFLoader }] = await Promise.all([import("three"), import("three/examples/jsm/loaders/GLTFLoader.js")]);
      if (dead) return;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.autoClear = false;
      glOk.current = true;
      const loader = new GLTFLoader();
      const [arcade, card] = await Promise.all([
        loader.loadAsync("/showcase/arcade.glb", bytes(ldArcade)).then((g) => { ldArcade(1); return g; }),
        loader.loadAsync("/showcase/card.glb", bytes(ldCard)).then((g) => { ldCard(1); return g; }),
      ]);
      await (document.fonts?.ready ?? Promise.resolve());
      if (dead) { renderer.dispose(); return; }

      // ---------- the arcade: only its top half shows, three-quarter view (like a photo) ----------
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
      scene.add(new THREE.HemisphereLight(0xfff3e6, 0x4a4250, 1.3));
      const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 4, 4); scene.add(key);
      const rim = new THREE.DirectionalLight(0xbcd7ff, 1.2); rim.position.set(3, 2, -3); scene.add(rim);
      // the picture is drawn upright on `sc`, then mapped onto `tc` the way this model's screen
      // is laid out in its texture (some models have it turned or mirrored)
      const sc = document.createElement("canvas"); sc.width = 1024; sc.height = 672;
      const sg = sc.getContext("2d")!;
      const tc = document.createElement("canvas"); tc.width = sc.width; tc.height = sc.height;
      const tg = tc.getContext("2d")!;
      const stex = new THREE.CanvasTexture(tc);
      stex.colorSpace = THREE.SRGBColorSpace;
      stex.anisotropy = 4;
      const model = arcade.scene;
      let screen: Mesh | null = null;
      // the screen: a "Screen" material, or the glass over the painted screen (this model has
      // two identical glass quads: the first one shows our picture, the copy is hidden)
      let su0 = 0, su1 = 1, sv0 = 0, sv1 = 1;
      model.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const nm = (m.material as import("three").Material).name;
        if (nm !== "Screen" && nm !== "glass") return;
        if (screen) { m.visible = false; return; }
        screen = m;
        // fit the picture over the screen's part of the texture
        const uv = m.geometry.getAttribute("uv");
        su0 = 1; su1 = 0; sv0 = 1; sv1 = 0;
        for (let i = 0; i < uv.count; i++) { su0 = Math.min(su0, uv.getX(i)); su1 = Math.max(su1, uv.getX(i)); sv0 = Math.min(sv0, uv.getY(i)); sv1 = Math.max(sv1, uv.getY(i)); }
        stex.repeat.set(1 / (su1 - su0), 1 / (sv1 - sv0));
        stex.offset.set(-su0 / (su1 - su0), -sv0 / (sv1 - sv0));
        m.material = new THREE.MeshBasicMaterial({ map: stex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      });
      if (!screen) throw new Error("arcade: no screen");
      const scr = screen as Mesh;
      // face the screen toward +z, scale so the screen is 1 unit wide, screen centre at 0
      const rig = new THREE.Group(); rig.add(model); scene.add(rig);
      rig.updateMatrixWorld(true);
      const nrm = new THREE.Vector3();
      {
        const na = scr.geometry.getAttribute("normal");
        for (let i = 0; i < na.count; i++) nrm.add(new THREE.Vector3().fromBufferAttribute(na, i));
        nrm.transformDirection(scr.matrixWorld);
      }
      model.rotation.y = -Math.atan2(nrm.x, nrm.z);
      rig.updateMatrixWorld(true);
      let sb = new THREE.Box3().setFromObject(scr);
      const s0 = 1 / sb.getSize(new THREE.Vector3()).x;
      model.scale.multiplyScalar(s0);
      rig.updateMatrixWorld(true);
      sb = new THREE.Box3().setFromObject(scr);
      const sMid = sb.getCenter(new THREE.Vector3());
      model.position.sub(sMid);
      rig.updateMatrixWorld(true);
      // the whole cabinet's height and middle (for framing)
      const allBox = new THREE.Box3().setFromObject(model);
      const SCR_H = sb.getSize(new THREE.Vector3()).y;
      // picture point (0..1, y down) → normalized texture coordinate, an affine fit over the
      // screen mesh's own vertices (now that it faces +z: picture x = world x, y = -world y)
      const PM = (() => {
        scr.updateWorldMatrix(true, false);
        const P = scr.geometry.getAttribute("position"), UV = scr.geometry.getAttribute("uv");
        const v = new THREE.Vector3(), pts: number[][] = [];
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(scr.matrixWorld);
          pts.push([v.x, v.y, (UV.getX(i) - su0) / (su1 - su0), (UV.getY(i) - sv0) / (sv1 - sv0)]);
          x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
        }
        // least squares: target = a·px + b·py + c, for target = un and vn
        const fit = (col: number) => {
          const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
          for (const q of pts) {
            const row = [(q[0] - x0) / (x1 - x0), (y1 - q[1]) / (y1 - y0), 1];
            for (let a = 0; a < 3; a++) { r[a] += row[a] * q[col]; for (let b = 0; b < 3; b++) A[a][b] += row[a] * row[b]; }
          }
          const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
          const D = det(A) || 1e-12;
          return [0, 1, 2].map((k) => det(A.map((row, i) => row.map((x, j) => (j === k ? r[i] : x)))) / D);
        };
        return { u: fit(2), v: fit(3) };
      })();
      const toUv = (px: number, py: number): [number, number] => [
        PM.u[0] * px + PM.u[1] * py + PM.u[2], PM.v[0] * px + PM.v[1] * py + PM.v[2],
      ];
      // `tc` takes the screen's own proportions in texture space; then the canvas transform
      // that puts picture pixels where the texture wants them (Y down = 1 - v, flipY)
      if (Math.abs(PM.u[1]) > Math.abs(PM.u[0])) { tc.width = sc.height; tc.height = sc.width; }
      const Wt = tc.width, Ht = tc.height;
      const picToTex: [number, number, number, number, number, number] = [
        (PM.u[0] * Wt) / sc.width, (-PM.v[0] * Ht) / sc.width,
        (PM.u[1] * Wt) / sc.height, (-PM.v[1] * Ht) / sc.height,
        PM.u[2] * Wt, (1 - PM.v[2]) * Ht,
      ];
      const allSize = allBox.getSize(new THREE.Vector3()), allMid = allBox.getCenter(new THREE.Vector3());
      // a small "K+S" in red marker on the dark panel under the screen, bottom-right corner.
      // The spot is known in the model's texture (KS_UV); find it on the surface (where the
      // panel faces front) and stick a sharp little decal there, inside the rig so it moves along.
      {
        let board: Mesh | null = null;
        model.traverse((o) => { if (!board && (o as Mesh).isMesh && /^Board_main/.test(o.name)) board = o as Mesh; });
        const hit = board ? surfaceAtUv(THREE, board, KS_UV[0], KS_UV[1]) : null;
        if (hit) {
          const c = document.createElement("canvas"); c.width = 320; c.height = 128;
          drawKS(c.getContext("2d")!);
          const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
          const wv = hit.tv.length() * 0.026;                     // ~27 texels wide along the panel
          const sticker = new THREE.Mesh(new THREE.PlaneGeometry(wv, wv * 0.4),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false }));
          const right = hit.tv.clone().negate().normalize();       // page right = less v
          const n = hit.n.clone().normalize();
          right.sub(n.clone().multiplyScalar(right.dot(n))).normalize();
          const up = new THREE.Vector3().crossVectors(n, right).normalize();
          sticker.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
          sticker.rotateZ(Math.PI / 4);                          // tilted 45°, leaning left
          sticker.scale.setScalar(0.85);
          sticker.position.copy(hit.p).addScaledVector(n, 0.0015).addScaledVector(up, wv * 0.12).addScaledVector(right, -wv * 0.08);
          rig.add(sticker);
        }
      }

      // ---------- the game cards ----------
      const cscene = new THREE.Scene();
      const ccam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      cscene.add(new THREE.HemisphereLight(0xffffff, 0x50505a, 1.4));
      const ck = new THREE.DirectionalLight(0xffffff, 2.4); ck.position.set(-2, 3, 5); cscene.add(ck);
      const cr = new THREE.DirectionalLight(0xffffff, 0.8); cr.position.set(3, -1, 2); cscene.add(cr);
      const prep = prepareCard(THREE, card.scene);
      const baseImg = prep.material.map?.image as CanvasImageSource | undefined;
      const cards = projects.map((p, i) => {
        const c = document.createElement("canvas"); c.width = TEX; c.height = TEX;
        if (baseImg) drawCardLabel(c.getContext("2d")!, baseImg, projectCard(p), i, prep.flipX, false);
        const t = new THREE.CanvasTexture(c);
        t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
        const mat = prep.material.clone();
        mat.map = t; mat.needsUpdate = true;
        // hover: the label turns to rippling, coloured pixel water with glitch slices
        const fx = { uHover: { value: 0 }, uTime: { value: 0 }, uBurst: { value: 0 }, at: -1e9, on: false };
        mat.userData.fx = fx;
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uHover = fx.uHover; sh.uniforms.uTime = fx.uTime; sh.uniforms.uBurst = fx.uBurst;
          sh.fragmentShader = "uniform float uHover, uTime, uBurst;\n" + sh.fragmentShader.replace("#include <map_fragment>", CARD_FX);
        };
        mat.customProgramCacheKey = () => "card-fx";
        const mesh = new THREE.Mesh(prep.geo, mat);
        mesh.userData.i = i;
        cscene.add(mesh);
        return mesh;
      });

      // ---------- the background: game cards with 90s arcade games, floating behind it all ----------
      // They drift up slowly and sway, and slip away from the pointer (a spring brings them back).
      const bscene = new THREE.Scene();
      bscene.add(new THREE.HemisphereLight(0xffffff, 0x50505a, 1.5));
      const bk = new THREE.DirectionalLight(0xffffff, 2); bk.position.set(-2, 3, 5); bscene.add(bk);
      const bcam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
      const rand = (a: number, b: number) => a + Math.random() * (b - a);
      // more cards than games (each game shows up two or three times), in mixed sizes:
      // a few big ones, some small, most in between
      const BG_N = 30, BG_TEX = 512;
      const SIZES = [0.6, 0.8, 1, 1, 1.15, 1.5, 0.7, 1, 1.85, 0.9];
      // the games' covers (a card without one gets painted art)
      const covers = await Promise.all(arcadeGames.map(async (gm) => {
        if (!gm.cover) return null;
        const im = new Image(); im.src = gm.cover;
        try { await im.decode(); return im; } catch { return null; }
      }));
      ldCovers(1);
      // a cover fills the panel, cropped to fit (the flyers are taller than the panel)
      const coverArt = (im: HTMLImageElement) => (g: CanvasRenderingContext2D, w: number, h: number) => {
        const k = Math.max(w / im.naturalWidth, h / im.naturalHeight);
        g.drawImage(im, (w - im.naturalWidth * k) / 2, (h - im.naturalHeight * k) * 0.3, im.naturalWidth * k, im.naturalHeight * k);
      };
      const floaters = Array.from({ length: BG_N }, (_, i) => {
        const gm = arcadeGames[i % arcadeGames.length];
        // small on screen: 512² labels (2048² × 30 was ~500 MB of GPU memory)
        const c = document.createElement("canvas"); c.width = BG_TEX; c.height = BG_TEX;
        if (baseImg) drawCardLabel(c.getContext("2d")!, baseImg, {
          code: `ARC-${gm.year}-${String(i + 1).padStart(2, "0")}`, tag: gm.genre.toUpperCase(), big: gm.title, bigMax: 76,
          art: covers[i % arcadeGames.length] ? coverArt(covers[i % arcadeGames.length]!) : (g, w, h) => drawGameArt(g, gm.genre, w, h, i),
          artOnly: !!covers[i % arcadeGames.length],
          small: "INSERT COIN", letter: gm.genre[0].toUpperCase(), year: gm.year, foot: "1P · 2P · PRESS START",
        }, i + 2, prep.flipX, false, BG_TEX);
        const t = new THREE.CanvasTexture(c);
        t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        const mat = prep.material.clone();
        mat.map = t; mat.needsUpdate = true; mat.color.setScalar(0.9);
        const mesh = new THREE.Mesh(prep.geo, mat);
        bscene.add(mesh);
        // spread out: one per slice across, at a random height and depth
        return {
          mesh, x: -1.15 + (2.3 * (i + Math.random() * 0.8)) / BG_N, y: rand(-1.3, 1.3), z: rand(0, 1),
          vx: rand(-0.015, 0.015), vy: rand(0.02, 0.045), ph: rand(0, 6.28), sp: rand(0.25, 0.55),
          rz: rand(-0.5, 0.5), wz: rand(-0.12, 0.12), ox: 0, oy: 0, pvx: 0, pvy: 0, kick: 0,
          size: SIZES[(i * 7) % SIZES.length] * rand(0.92, 1.08),
        };
      });

      // ---------- post: the site's curved-TV finish over the paper ----------
      const rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
      const rtC = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
      const rtB = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
      const bc = document.createElement("canvas"); bc.width = 2048; bc.height = 1024;
      {
        const bx = bc.getContext("2d")!;
        bx.fillStyle = "#000"; bx.fillRect(0, 0, 2048, 1024);
        bx.fillStyle = "#fff"; bx.font = "600 30px ui-monospace, Menlo, monospace";
        const words = projects.flatMap((p) => [p.name.toUpperCase(), p.summary, p.stack.join(" / "), `${p.type} ${p.year}`, `/projects/${p.slug}`]);
        for (let y = 40, k = 0; y < 1024; y += 46 + (k % 3) * 10, k++) {
          let line = "";
          while (line.length < 120) line += words[(k * 7 + line.length) % words.length] + "   ";
          bx.globalAlpha = 0.35 + ((k * 37) % 10) / 15;
          bx.fillText(line, -((k * 131) % 400), y);
        }
      }
      // the ink hero's canvas (hidden in arcade mode), read as a texture each frame
      const inkCanvas = document.querySelector<HTMLCanvasElement>(".ink-hero[data-arcade] .ink-canvas");
      const inkTex = inkCanvas ? new THREE.CanvasTexture(inkCanvas) : new THREE.Texture();
      inkTex.colorSpace = THREE.SRGBColorSpace;
      const ttex = new THREE.CanvasTexture(bc);
      ttex.wrapS = ttex.wrapT = THREE.RepeatWrapping;
      const post = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
        uniforms: {
          tScene: { value: rt.texture }, tCards: { value: rtC.texture }, tBack: { value: rtB.texture }, tInk: { value: inkTex }, uInk: { value: 0 }, tText: { value: ttex }, uPaper: { value: new THREE.Vector3(0.949, 0.937, 0.914) }, uTextCol: { value: new THREE.Vector3(0.62, 0.62, 0.62) }, uEdgeCol: { value: new THREE.Vector3(1, 1, 1) },
          uT: { value: 0 }, uAspect: { value: 1 }, uClean: { value: 0 }, uBend: { value: BEND }, uDrift: { value: 0 }, uKick: { value: 0 }, uOver: { value: OVER },
        },
      });
      const pscene = new THREE.Scene(); pscene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
      const pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      // framing. Desktop: the arcade's screen at 36% across, the card wheel on the right.
      // Phones: the arcade at the top, the cards in a row below.
      let aspect = 1, phone = false, sized = "";
      const CARD_D = 6;
      const fit = () => {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        // resizing a canvas clears it (even to the same size): only when it really changed
        if (sized === `${w}x${h}x${dpr}`) return;
        sized = `${w}x${h}x${dpr}`;
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        const k = Math.min(dpr * OVER, 2.6);                      // the wider scene, at a sane size
        rt.setSize(Math.round(w * k), Math.round(h * k));
        rtC.setSize(Math.round(w * dpr), Math.round(h * dpr));
        rtB.setSize(Math.round(w * dpr), Math.round(h * dpr));
        aspect = w / Math.max(1, h); phone = w <= 760;
        camera.aspect = aspect; ccam.aspect = aspect; bcam.aspect = aspect;
        camera.zoom = 1 / OVER;
        ccam.updateProjectionMatrix(); bcam.updateProjectionMatrix();
        post.uniforms.uAspect.value = aspect;
        poseAt(lastE, lastDv);
      };
      // Two camera poses, blended by the scroll (e = 0 … 1):
      // 0, the landing: the whole cabinet, seen a little from its right, the K on its screen;
      // 1, the showcase: close on the screen from its left, the cards beside it.
      const vis = 2 * Math.tan((camera.fov / 2) * Math.PI / 180);
      const tgtA = allMid.clone(), tgtB = new THREE.Vector3(0, -SCR_H * 0.1, 0), tgt = new THREE.Vector3();
      let lastE = 0, lastDv = 0;
      // the dive: straight down the screen's own normal, close enough that it fills the view
      const sn = new THREE.Vector3();
      {
        scr.updateWorldMatrix(true, false);
        const na = scr.geometry.getAttribute("normal");
        for (let i = 0; i < na.count; i++) sn.add(new THREE.Vector3().fromBufferAttribute(na, i));
        sn.transformDirection(scr.matrixWorld).normalize();
        if (sn.z < 0) sn.negate();
      }
      const yawD = Math.atan2(sn.x, sn.z), pitchD = Math.asin(Math.max(-0.9, Math.min(0.9, sn.y)));
      const poseAt = (e: number, dv = 0) => {
        lastE = e; lastDv = dv;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        const dA = phone ? Math.max(allSize.y / (0.66 * vis), allSize.x * 1.7 / (0.8 * vis * aspect)) : allSize.y / (0.8 * vis);
        const dB = phone ? 1 / (0.56 * vis * aspect) : SCR_H / (0.3 * vis);
        const dD = Math.min(SCR_H, 1 / aspect) / (vis * OVER) * 1.16;  // the screen just fills the view
        let yaw = 0.45 + (-0.5 - 0.45) * e, pitch = 0.08 + (0.16 - 0.08) * e;
        let d = dA * Math.pow(dB / dA, e);                        // distance changes evenly in log
        tgt.lerpVectors(tgtA, tgtB, e);
        yaw += (yawD - yaw) * dv; pitch += (pitchD - pitch) * dv;
        d *= Math.pow(dD / d, dv);
        tgt.multiplyScalar(1 - dv);                               // → the screen's centre (0, 0, 0)
        camera.position.set(Math.sin(yaw) * d * Math.cos(pitch), Math.sin(pitch) * d, Math.cos(yaw) * d * Math.cos(pitch)).add(tgt);
        camera.lookAt(tgt);
        let fx = 0.5 + ((phone ? 0.5 : 0.37) - 0.5) * e, fy = 0.5 + ((phone ? 0.34 : 0.5) - 0.5) * e;
        fx += (0.5 - fx) * dv; fy += (0.5 - fy) * dv;
        // (offsets are a share of the wider, zoomed-out view)
        camera.setViewOffset(w, h, ((0.5 - fx) * w) / OVER, ((0.5 - fy) * h) / OVER, w, h);
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit); ro.observe(canvas);

      // where card offset d sits (view space of the card camera), its size and turn
      const cardPose = (d: number, hover: boolean) => {
        const hh = Math.tan((ccam.fov / 2) * Math.PI / 180) * CARD_D, hw = hh * aspect;
        const th = d * CARD_STEP;
        // desktop: an arc on the right; the cards two away sit half off the top / bottom edge
        const R = phone ? hw * 1.6 : hh * 1.2;
        let x: number, y: number;
        if (phone) {
          const cy = -hh * 0.52 - R;
          x = Math.sin(th) * R; y = cy + Math.cos(th) * R;
        } else {
          const ax = hw * 0.46, cx = ax + R;
          x = cx - Math.cos(th) * R; y = -Math.sin(th) * R;
        }
        const focus = Math.max(0, 1 - Math.abs(d));
        const s = (phone ? 0.3 : 0.46) * hh * (0.74 + 0.26 * focus) * (hover ? 1.05 : 1);
        return { x, y, z: -CARD_D + focus * 0.4 + (hover ? 0.15 : 0), s, rz: phone ? -th * 0.6 : th * 0.5, ry: phone ? 0 : -0.38 + focus * 0.18, focus };
      };

      // the arcade screen's outline on the page (GRID×GRID, viewport fractions), through the lens
      const outline = () => {
        const out = new Float32Array(GRID * GRID * 2);
        scr.updateWorldMatrix(true, false);
        const g = scr.geometry, P = g.getAttribute("position").array, UV = g.getAttribute("uv").array;
        const I = g.getIndex()?.array ?? null;
        const v3 = new THREE.Vector3();
        for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
          // picture point → the mesh's uv
          const [un, vn] = toUv(i / (GRID - 1), j / (GRID - 1));
          const [x, y, z] = pointAtUv(P, UV, I, su0 + un * (su1 - su0), sv0 + vn * (sv1 - sv0));
          v3.set(x, y, z).applyMatrix4(scr.matrixWorld).project(camera);
          const [qx, qy] = lensInvK(v3.x * OVER * aspect, v3.y * OVER, bendNow);
          out[(j * GRID + i) * 2] = qx / aspect * 0.5 + 0.5;
          out[(j * GRID + i) * 2 + 1] = 0.5 - qy * 0.5;
        }
        return out;
      };

      // pointer → what is under it (through the same lens as the picture)
      const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
      const pick = (cx: number, cy: number): { card: number } | { arcade: true } | null => {
        const r = canvas.getBoundingClientRect();
        let q = [((cx - r.left) / r.width * 2 - 1) * aspect, 1 - ((cy - r.top) / r.height) * 2];
        ptr.set(q[0] / aspect, q[1]);
        ray.setFromCamera(ptr, ccam);
        const hc = ray.intersectObjects(cards, false)[0];
        if (hc) return { card: hc.object.userData.i as number };
        const r2 = q[0] * q[0] + q[1] * q[1];
        q = q.map((v) => v * (1 + BEND * r2 + 0.11 * r2 * r2));
        ptr.set(q[0] / aspect / OVER, q[1] / OVER);
        ray.setFromCamera(ptr, camera);
        if (ray.intersectObject(rig, true).length) return { arcade: true };
        return null;
      };
      let hover = -1;
      // drag a card to turn it (any way, all the way round); it keeps spinning a little
      const spin = projects.map(() => ({ yaw: 0, pitch: 0, vy: 0, vp: 0 }));
      let drag: { i: number; x: number; y: number; moved: number } | null = null, dragMoved = 0;
      const onDown = (e: PointerEvent) => {
        const h = pick(e.clientX, e.clientY);
        if (!h || !("card" in h)) return;
        drag = { i: h.card, x: e.clientX, y: e.clientY, moved: 0 };
        dragState.on = true;
        canvas.setPointerCapture(e.pointerId);
      };
      const onDrag = (e: PointerEvent) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y, sp = spin[drag.i];
        drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        sp.vy = dx * 0.013; sp.vp = dy * 0.011;
        sp.yaw += sp.vy; sp.pitch += sp.vp;
        canvas.dataset.drag = "on";
      };
      const onUp = () => { if (drag) dragMoved = drag.moved; drag = null; dragState.on = false; delete canvas.dataset.drag; };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onDrag);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);
      const onClick = (e: MouseEvent) => {
        if (dragMoved > 6) { dragMoved = 0; return; }              // that was a spin, not a click
        if (section.dataset.labels !== "on") { scrollTo({ top: innerHeight, behavior: "smooth" }); return; } // landing: go on down
        const h = pick(e.clientX, e.clientY);
        if (!h) return;
        if ("arcade" in h) open(activeRef.current);
        else if (h.card === activeRef.current) open(h.card);
        else goToRef.current(h.card);
      };
      const onHover = (e: PointerEvent) => {
        const h = pick(e.clientX, e.clientY);
        hover = h && "card" in h ? h.card : -1;
        canvas.dataset.hot = String(!!h);
      };
      canvas.addEventListener("click", onClick);
      canvas.addEventListener("pointermove", onHover);

      let raf = 0, labels = "", shown = -1, cur = targetRef.current, last = performance.now();
      let bendNow = BEND, outAt = -1;                           // outAt: when the way back out starts
      let scrKey = "", prevKey = "", changedAt = -1e9, ps = -1, impactAt = -1e9;
      // cards fall in from above when the showcase arrives (`fall` = when each started, -1 = up)
      const fall = projects.map(() => -1), lift = projects.map(() => 1);
      const FALL_S = 0.42;
      const t0 = performance.now();
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (!reduced) { mx += (tx - mx) * 0.06; my += (ty - my) * 0.06; }
        // scroll progress over the first screen, eased by time so it glides
        const p = Math.min(1, Math.max(0, scrollY / innerHeight));
        if (ps < 0) ps = p;
        ps = reduced || now < snap.until ? p : ps + (p - ps) * (1 - Math.exp(-dt * 5));
        if (now < snap.until && p < 0.6) { lift.fill(1); fall.fill(-1); }   // a glitch jump: cards already up
        // the turn runs under the ink: it starts while the screen is still covered (0.3) and
        // settles just after the ink has drained (0.62), so you see it moving as it drains
        const tp = Math.min(1, Math.max(0, (ps - 0.3) / 0.42));
        const e = tp < 0.5 ? 4 * tp * tp * tp : 1 - Math.pow(-2 * tp + 2, 3) / 2;
        // into the screen (opening a project) / back out of it (returning from one)
        const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
        const exNow = exitRef.current;
        const exT = exNow ? now - exNow.t : 0;
        const shake = exNow && !reduced ? Math.max(0, 1 - Math.pow(exT / SHAKE_MS, 3)) : 0;
        const dvIn = exNow ? (reduced ? 1 : io(Math.min(1, Math.max(0, (exT - SHAKE_MS * 0.75) / DIVE_MS)))) : 0;
        if (back && outAt < 0) outAt = now + 150;
        const dvOut = back && !reduced ? 1 - io(Math.min(1, Math.max(0, (now - outAt) / OUT_MS))) : 0;
        const dv = Math.max(dvIn, dvOut);
        bendNow = BEND * (1 - dv);                                // flat once inside: like the project page
        poseAt(e, dv);
        // labels stay away while we are (partly) inside the screen
        if (dvOut > 0.2) section.dataset.exit = "true";
        else if (back && !exNow && section.dataset.exit) delete section.dataset.exit;
        // and the cabinet itself spins once round, slowing into place
        const spinIn = reduced ? 0 : -Math.PI * 2 * Math.pow(1 - tp, 3);
        // the ink floods out of the arcade's screen: tell the ink layer where that is
        if (ps < 0.5) {
          scr.updateWorldMatrix(true, false);
          const c = new THREE.Box3().setFromObject(scr).getCenter(new THREE.Vector3()).project(camera);
          const [qx, qy] = lensInv(c.x * OVER * aspect, c.y * OVER, BEND);
          floodOrigin.x = qx / aspect * 0.5 + 0.5; floodOrigin.y = qy * 0.5 + 0.5;
        }
        const lab = ps > (labels === "on" ? 0.6 : 0.66) ? "on" : "off";
        if (lab !== labels) {
          labels = lab; section.dataset.labels = lab;
          if (lab === "off") delete section.dataset.calm;
        }

        const a = wrap(Math.round(targetRef.current));
        if (a !== shown) { shown = a; setActive(a); }
        // the screen: the K on the landing, the project once the camera has turned
        const want = ps < 0.52 ? "K" : String(shown);
        if (want !== scrKey) { if (scrKey) { prevKey = scrKey; changedAt = now; } scrKey = want; }
        cur += (targetRef.current - cur) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
        const since = (now - changedAt) / 1000;
        const glitch = reduced ? 0 : Math.max(0, 1 - since / CHANGE_S);
        const ex = exNow;
        if (ex) section.dataset.exit = "true";
        const showing = since < CHANGE_S * 0.4 && prevKey ? prevKey : scrKey;
        if (showing === "K") drawKFace(sg, { t, glitch: ex ? 0 : glitch });
        else drawScreenFace(sg, projects[+showing], +showing, n, { t, glitch: ex ? shake * 0.9 : dvOut > 0 ? 0 : glitch, prompt: !ex });
        if (shake > 0.05) {
          // the error: a red bar with ERROR, flickering
          const W = sc.width, H = sc.height;
          if (Math.floor(now / 70) % 3 !== 0) {
            sg.fillStyle = "rgba(200, 20, 30, 0.88)"; sg.fillRect(0, H * 0.42, W, H * 0.16);
            sg.fillStyle = "#fff"; sg.textBaseline = "middle";
            sg.font = `900 ${Math.round(H * 0.1)}px ${getComputedStyle(document.body).getPropertyValue("--font-dot").trim() || "monospace"}`;
            const tx2 = "ERROR"; sg.fillText(tx2, (W - sg.measureText(tx2).width) / 2 + (Math.random() - 0.5) * 30 * shake, H * 0.5);
          }
        }
        tg.setTransform(...picToTex);
        tg.drawImage(sc, 0, 0);
        stex.needsUpdate = true;

        // the arcade sways with the pointer a little and jolts on a change (and when a card lands)
        const hit = Math.max(0, 1 - (now - impactAt) / 180);
        const jolt = glitch * Math.sin(since * 40) * 0.012 + hit * Math.sin((now - impactAt) / 18) * 0.006;
        rig.rotation.y = mx * 0.1 * (1 - dv) + jolt + spinIn;
        rig.rotation.x = -my * 0.03 * (1 - dv);
        // the error shake: hard little jumps, a few times a frame-second
        const jt = Math.floor(now / 45);
        const rnd = (k: number) => (Math.sin(jt * 12.9898 + k * 78.233) * 43758.5453) % 1;
        rig.position.set(rnd(1) * 0.025 * shake, rnd(2) * 0.018 * shake, 0);
        rig.rotation.z = rnd(3) * 0.03 * shake;

        // cards on the wheel: they drop in hard from above when the showcase arrives, and
        // fly back up if you scroll back to the landing
        const hh = Math.tan((ccam.fov / 2) * Math.PI / 180) * CARD_D;
        const down = ps > 0.7 || (reduced && p > 0.7);
        if (down && fall.every((f) => f < 0)) {
          const order = cards.map((m) => near(m.userData.i, cur) - cur).map((d, i) => [d, i]).sort((x, y) => x[0] - y[0]);
          // back from a project (or reduced motion): already in place, no drop
          order.forEach(([, i], k) => { if (back || reduced) { fall[i] = 1; lift[i] = 0; } else fall[i] = now + k * 85; });
        }
        if (!down && ps < 0.6) fall.fill(-1);
        for (const m of cards) {
          const i = m.userData.i as number;
          const d = near(i, cur) - cur;
          let off = 0, tilt = 0;
          if (fall[i] < 0) { lift[i] += (1 - lift[i]) * Math.min(1, dt * 7); off = lift[i]; }
          else {
            const ft = (now - fall[i]) / 1000;
            if (ft < 0) off = lift[i];
            else if (ft < FALL_S) { const f = ft / FALL_S; off = lift[i] * (1 - f * f); tilt = (1 - f) * (i % 2 ? 0.35 : -0.3); }  // gravity
            else {
              const st = ft - FALL_S;                                       // the slam: a short squash, then still
              off = st < 0.12 ? -0.05 * Math.sin((st / 0.12) * Math.PI) : 0;
              if (lift[i] > 0.5 && Math.abs(d) < 1.5) impactAt = now;
              if (lift[i] > 0.5) music.thud();                              // each card lands with a thud
              lift[i] = 0;
            }
          }
          const vis = Math.abs(d) < 3.2 && off < 0.98;
          m.visible = vis;
          if (!vis) continue;
          const p = cardPose(d, hover === i && Math.abs(d) < 0.5);
          // into the screen: the cards are swept off to the right (and back in on the way out)
          m.position.set(p.x + mx * 0.05 + dv * dv * hh * aspect * 2.2, p.y + my * 0.04 + off * hh * 2.8, p.z);
          m.scale.setScalar(p.s);
          const sp = spin[i];
          if (!drag || drag.i !== i) {
            sp.yaw += sp.vy; sp.pitch += sp.vp; sp.vy *= 0.93; sp.vp *= 0.9;
            // once it leaves the front, it turns back to face you (the short way round)
            if (Math.abs(d) > 0.5 && Math.abs(sp.vy) < 0.002) {
              const hy = Math.round(sp.yaw / (Math.PI * 2)) * Math.PI * 2, hp = Math.round(sp.pitch / (Math.PI * 2)) * Math.PI * 2;
              sp.yaw += (hy - sp.yaw) * 0.08; sp.pitch += (hp - sp.pitch) * 0.08;
            }
          }
          m.rotation.set(-my * 0.12 + (reduced ? 0 : Math.sin(t * 0.8 + i) * 0.03) + sp.pitch + tilt * 0.6, p.ry + mx * 0.15 + sp.yaw, p.rz + tilt, "YXZ");
          const mat = m.material as import("three").MeshStandardMaterial;
          mat.color.setScalar(0.62 + 0.38 * p.focus);
          const fx = mat.userData.fx as { uHover: { value: number }; uTime: { value: number }; uBurst: { value: number }; at: number; on: boolean };
          const over = hover === i && !reduced;
          if (over && !fx.on) fx.at = now;                        // the splash plays once per hover
          fx.on = over;
          fx.uBurst.value = Math.max(0, 1 - (now - fx.at) / 650);
          fx.uHover.value += ((over ? 1 : 0) - fx.uHover.value) * Math.min(1, dt * 6);
          fx.uTime.value = t;
        }

        // the floating background cards: only on the landing (the showcase has its own cards);
        // the swap happens under the ink, which covers the page from ps 0.35
        const backOn = ps < 0.45;
        bscene.visible = backOn;
        const thb = Math.tan((bcam.fov / 2) * Math.PI / 180);
        for (const f of backOn ? floaters : []) {
          if (!reduced) { f.x += f.vx * dt; f.y += f.vy * dt; f.rz += f.wz * dt; }
          // off the top: back in from the bottom, somewhere else across
          if (f.y > 1.4) { f.y = -1.4; f.x = rand(-1.1, 1.1); }
          if (f.x > 1.3) f.x = -1.3; else if (f.x < -1.3) f.x = 1.3;
          // the pointer pushes them away, a spring brings them back (screen units, -1..1)
          const dx = (f.x + f.ox - tx) * aspect, dy = f.y + f.oy - ty, dist = Math.hypot(dx, dy) + 1e-4;
          const R = 0.3 + 0.12 * f.size;                            // big cards feel the pointer from further
          if (ptrOn && dist < R && !reduced) {
            const k = Math.pow(1 - dist / R, 2) * 14;
            f.pvx += (dx / dist / aspect) * k * dt; f.pvy += (dy / dist) * k * dt;
            f.kick += k * dt * (dx > 0 ? 1 : -1);                      // and it spins off a little
          }
          f.pvx -= f.ox * 2.5 * dt; f.pvy -= f.oy * 2.5 * dt;
          const damp = Math.exp(-dt * 3.2);
          f.pvx *= damp; f.pvy *= damp; f.kick *= Math.exp(-dt * 1.5);
          f.ox += f.pvx * dt; f.oy += f.pvy * dt;
          const D = CARD_D * (1 + f.z * 0.9), hhD = thb * D;
          f.mesh.position.set((f.x + f.ox) * hhD * aspect, (f.y + f.oy) * hhD, -D);
          f.mesh.scale.setScalar((phone ? 0.26 : 0.34) * f.size * thb * CARD_D);   // further ones look smaller
          const tt = reduced ? 0 : t * f.sp;
          f.mesh.rotation.set(Math.sin(tt + f.ph) * 0.45, Math.sin(tt * 0.8 + f.ph * 2) * 0.9 + f.kick, f.rz, "YXZ");
        }

        renderer.setRenderTarget(rtB);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(bscene, bcam);
        renderer.setRenderTarget(rt);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.setRenderTarget(rtC);
        renderer.clear();
        renderer.render(cscene, ccam);
        renderer.setRenderTarget(null);
        // ink behind the arcade while it is on screen (it is gone after the drain)
        const inkOn = !!inkCanvas && (p < 0.66 || ps < 0.66) && inkCanvas.width > 2;
        if (inkOn) inkTex.needsUpdate = true;
        post.uniforms.uInk.value = inkOn ? 1 : 0;
        post.uniforms.uT.value = t;
        post.uniforms.uDrift.value = t * 0.004;
        post.uniforms.uKick.value = ex ? shake * 1.4 : Math.max(glitch * 0.6, hit * 0.45);
        // calm (no VHS) once inside, so the hand-off frame is the plain picture
        post.uniforms.uClean.value = Math.max(dvIn > 0 ? Math.min(1, dvIn * 3) : 0, dvOut);
        post.uniforms.uBend.value = bendNow;
        renderer.render(pscene, pcam);
        if (!framed) { framed = true; ldFrame(1); }

        if (stillRef.current && stillRef.current.style.display === "block") stillRef.current.style.display = "none";
        if (ex && exT >= SHAKE_MS * 0.75 + DIVE_MS && goRef.current) {
          try {
            setHomeShot(canvas.toDataURL("image/jpeg", 0.92), mx, my);
            sessionStorage.setItem(CARD_KEY, JSON.stringify({ i: shown, t: Date.now(), g: Array.from(outline()) }));
          } catch {}
          const go = goRef.current; goRef.current = null; go();
        }
      };
      raf = requestAnimationFrame(frame);
      stop = () => {
        cancelAnimationFrame(raf); ro.disconnect();
        canvas.removeEventListener("click", onClick); canvas.removeEventListener("pointermove", onHover);
        canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onDrag);
        canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp);
        renderer.dispose(); rt.dispose(); rtC.dispose(); rtB.dispose();
      };
    })().catch((e) => { console.warn("[showcase]", e); [ldArcade, ldCard, ldCovers, ldFrame].forEach((f) => f(1)); });

    return () => {
      dead = true; stop();
      window.removeEventListener("wheel", onWheel);
      section.removeEventListener("touchstart", onTouchStart);
      section.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [open]);

  const p = projects[active];
  return (
    <section ref={sectionRef} className="sc" aria-labelledby="work-title">
      <noscript>
        <style>{".sc .sc__fade{opacity:1!important}"}</style>
      </noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={stillRef} className="sc__still" alt="" aria-hidden="true" />
      <canvas ref={canvasRef} className="sc__canvas" aria-label={`${p.name}: ${p.summary}`} role="img" />

      <header className="sc__top sc__fade">
        <a
          className="brand"
          href="#top"
          aria-label={`${site.name}, back to top`}
          onClick={(e) => {
            // a glitch cut to the landing, not the whole scroll animation backwards
            e.preventDefault();
            glitchJump(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
          }}
        >
          <KLogo />
          {site.name}
        </a>
      </header>
      <nav className="sc__list" aria-label="Menu and projects">
        {/* the menu, arcade style (the corner links were too faint) */}
        <div className="sc__menu sc__fade">
          <h2 id="work-title" className="sc__title">Menu</h2>
          <ul className="sc__menu-list">
            <li onPointerEnter={() => { music.blip(); prefetch(...ABOUT_FILES); }} onFocus={() => prefetch(...ABOUT_FILES)}><TvLink className="sc__menu-link" href="/about/">About</TvLink></li>
            <li onPointerEnter={() => music.blip()}><TvLink className="sc__menu-link" href="/about/#contact">Contact us</TvLink></li>
            <li onPointerEnter={() => music.blip()}><a className="sc__menu-link" href={site.resume} target="_blank" rel="noopener">Resume ↗</a></li>
          </ul>
        </div>
        <ol className="sr-only">
          {projects.map((x, i) => (
            <li key={x.slug}>
              <button type="button" aria-current={i === active} onClick={() => (i === active ? open(i) : goTo(i))}>
                {x.name}: {x.summary}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <p className="sc__summary sc__fade" aria-live="polite">
        <span>Click to open · scroll to change</span>
      </p>
    </section>
  );
}

