"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { projects } from "@/content/projects";
import { site } from "@/content/site";
import { RETURN_KEY } from "./ProjectDetail";
import { BEND, CARD_KEY, GRID, lensInv } from "@/lib/cardGrid";
import { homeShot, homeShotMouse, setHomeShot } from "@/lib/snapshot";
import { drawScreenFace } from "@/lib/screenFace";
import KLogo from "./KLogo";
import BmoScreen from "./BmoScreen";
import TvLink from "./TvLink";

/*
 * Home page project section (second screen, under the ink K).
 *
 * An old computer (glTF "Quadronic 250", CC BY-SA 4.0, credited on the page) stands in the
 * middle of the paper page. Its screen shows the current project: number, name, type · year
 * and a blinking prompt. Scrolling changes the channel: the screen glitches and the next
 * name comes up. The whole view goes through the site's curved-TV finish (lens, tears, a
 * rolling band, grain) over the paper with faint drifting text.
 *
 * Click: the labels fade, the screen calms, a still of this view and the screen's outline
 * (a GRID×GRID grid, through the same lens) go to the project page, whose room then grows
 * out from behind that screen. Back: the project page shrinks into the same outline, and
 * this page shows the still until its own first frame.
 */

const EXIT_MS = 260;          // click: labels fade and the screen calms, then the page opens
const CHANGE_S = 0.5;         // channel change glitch
const BG_TEXT = 0.2;          // background text visibility

const POST_VS = `
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = `
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
uniform sampler2D tScene, tText;
uniform vec3 uPaper;
uniform float uT, uAspect, uClean, uBend, uDrift, uKick;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
vec2 lensFwd(vec2 q, float k){ float r2 = dot(q, q); return q * (1.0 + k * r2 + 0.11 * r2 * r2); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec4 sceneAt(vec2 s){
  vec2 uv = vec2(s.x / uAspect * 0.5 + 0.5, s.y * 0.5 + 0.5);
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
  s.x += rb * (noise(vec2(floor(s.y * 180.0) * 0.6, uT * 20.0)) - 0.5) * 0.03 * calm;
  // paper with faint drifting text, then the scene (premultiplied, linear) over it
  vec2 tuv = vec2(s.x * 0.22 + 0.5, s.y * 0.22 + 0.5 - uDrift);   // canvas textures are flipped
  float txt = texture(tText, tuv, 1.6).r;
  vec3 bg = lin(mix(uPaper, vec3(0.62), txt * ${BG_TEXT.toFixed(2)}));
  float ca = (0.002 + uKick * 0.006) * (0.4 + length(q)) * calm;
  vec4 c = sceneAt(s);
  vec3 col = bg * (1.0 - c.a) + c.rgb;
  vec4 cr = sceneAt(s + vec2(ca, 0.0)), cb = sceneAt(s - vec2(ca, 0.0));   // colour bleed
  col.r = (bg * (1.0 - cr.a) + cr.rgb).r;
  col.b = (bg * (1.0 - cb.a) + cb.rgb).b;
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  // faded colour, washed-out edges, grain, scanlines, the rolling band's glow
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), 0.12) * 0.97 + 0.025;
  float edge = smoothstep(0.75, 1.7, length(q * vec2(0.62, 1.0)));
  col = mix(col, vec3(1.0), edge * 0.5);
  col += (hash(vUv * vec2(1920.0, 1080.0) + uT) - 0.5) * (0.05 + uKick * 0.08);
  col *= 1.0 - 0.035 * step(0.5, fract(vUv.y * 300.0));
  col += rb * 0.02;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

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

export default function ComputerShowcase() {
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
        if (sectionRef.current) sectionRef.current.dataset.labels = "on";
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
  };

  const open = useCallback((i: number) => {
    const href = `/projects/${projects[i].slug}/`;
    if (exitRef.current) return;
    if (!glOk.current) { router.push(href); return; }
    exitRef.current = { row: i, t: performance.now() };
    goRef.current = () => router.push(href);
    router.prefetch(href);
    const pre = new Image(); pre.src = projects[i].cover; pre.decode().catch(() => {});
  }, [router]);
  const activeRef = useRef(0);
  activeRef.current = active;

  useEffect(() => {
    const section = sectionRef.current!;
    const canvas = canvasRef.current!;
    let stop = () => {}, dead = false;
    const n = projects.length;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Scrolling: the page scrolls normally until this section fills the screen; then the
    // wheel changes the channel. The projects loop forever.
    const wrap = (k: number) => ((k % n) + n) % n;
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    let acc = 0, lastStep = 0;
    const step = (d: number) => { targetRef.current = Math.round(targetRef.current) + d; lastStep = performance.now(); };
    const onWheel = (e: WheelEvent) => {
      if (!atBottom()) return;
      e.preventDefault();
      acc += e.deltaY;
      // one channel per flick; a trackpad's long tail does not skip several
      if (Math.abs(acc) > 60 && performance.now() - lastStep > 380) { step(Math.sign(acc)); acc = 0; }
      if (performance.now() - lastStep > 380 && Math.abs(acc) < 60) acc *= 0.9;
    };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => {
      if (!atBottom()) return;
      const y = e.touches[0].clientY;
      e.preventDefault();
      if (Math.abs(touchY - y) > 50) { step(Math.sign(touchY - y)); touchY = y; }
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

    // back from a project page: start on it, same pointer, no channel-change glitch
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
    const onPointer = (e: PointerEvent) => { tx = (e.clientX / innerWidth) * 2 - 1; ty = -((e.clientY / innerHeight) * 2 - 1); };
    window.addEventListener("pointermove", onPointer, { passive: true });

    void (async () => {
      const [THREE, { GLTFLoader }] = await Promise.all([import("three"), import("three/examples/jsm/loaders/GLTFLoader.js")]);
      if (dead) return;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      glOk.current = true;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6b6257, 1.5));
      const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-2.5, 3.5, 4); scene.add(key);
      const fill = new THREE.DirectionalLight(0xffe7cf, 0.8); fill.position.set(3, 1, 2); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(1, 3, -4); scene.add(rim);

      // the screen picture
      const sc = document.createElement("canvas"); sc.width = 1024; sc.height = 632;
      const sg = sc.getContext("2d")!;
      const stex = new THREE.CanvasTexture(sc);
      stex.colorSpace = THREE.SRGBColorSpace;
      stex.anisotropy = 4;

      // the computer: centred, 1 unit tall, turned to face us; its old material format
      // (specular-glossiness) is rebuilt as standard materials from the file's own colours
      const rig = new THREE.Group(); scene.add(rig);
      const gltf = await new GLTFLoader().loadAsync("/showcase/computer.glb");
      if (dead) { renderer.dispose(); return; }
      const model = gltf.scene;
      const mats = (gltf.parser.json.materials ?? []) as { name: string; extensions?: { KHR_materials_pbrSpecularGlossiness?: { diffuseFactor?: number[]; glossinessFactor?: number } } }[];
      let screen: import("three").Mesh | null = null;
      model.traverse((o) => {
        const m = o as import("three").Mesh;
        if (!m.isMesh) return;
        const name = (m.material as import("three").Material).name;
        if (name === "Screen") {
          screen = m;
          // fit the picture over the screen's part of the texture
          const uv = m.geometry.getAttribute("uv");
          let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
          for (let i = 0; i < uv.count; i++) { u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i)); v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i)); }
          stex.repeat.set(1 / (u1 - u0), 1 / (v1 - v0));
          stex.offset.set(-u0 / (u1 - u0), -v0 / (v1 - v0));
          m.material = new THREE.MeshBasicMaterial({ map: stex, toneMapped: false });
          return;
        }
        const e = mats.find((x) => x.name === name)?.extensions?.KHR_materials_pbrSpecularGlossiness;
        const d = e?.diffuseFactor ?? [0.8, 0.8, 0.8, 1];
        m.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(d[0], d[1], d[2]),
          roughness: 1 - (e?.glossinessFactor ?? 0.5) * 0.7,
          metalness: name === "Shiny_Metal" ? 0.8 : 0,
        });
      });
      model.rotation.y = Math.PI;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const s = 1 / size.y;
      model.scale.setScalar(s);
      model.position.copy(mid.multiplyScalar(-s));
      rig.add(model);
      // soft shadow on the floor
      {
        const c = document.createElement("canvas"); c.width = c.height = 128;
        const x = c.getContext("2d")!;
        const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
        sh.rotation.x = -Math.PI / 2; sh.position.y = -0.5;
        scene.add(sh);
      }

      // post: the site's curved-TV finish, over paper with faint drifting text
      const rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
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
      const ttex = new THREE.CanvasTexture(bc);
      ttex.wrapS = ttex.wrapT = THREE.RepeatWrapping;
      const post = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
        uniforms: {
          tScene: { value: rt.texture }, tText: { value: ttex }, uPaper: { value: new THREE.Vector3(0.949, 0.937, 0.914) },
          uT: { value: 0 }, uAspect: { value: 1 }, uClean: { value: 0 }, uBend: { value: BEND }, uDrift: { value: 0 }, uKick: { value: 0 },
        },
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
      const pscene = new THREE.Scene(); pscene.add(quad);
      const pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      let aspect = 1, phone = false;
      const fit = () => {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        rt.setSize(Math.round(w * dpr), Math.round(h * dpr));
        aspect = w / Math.max(1, h); phone = w <= 760;
        camera.aspect = aspect;
        // far enough that the computer fits: ~62% of the height, or the width on phones
        const vis = 2 * Math.tan((camera.fov / 2) * Math.PI / 180);
        const d = Math.max(1 / (0.62 * vis), (1.2 / 0.86) / (vis * aspect));
        camera.position.set(0, 0.22 * d / 3, d);
        camera.lookAt(0, phone ? -0.32 : -0.04, 0);
        camera.updateProjectionMatrix();
        post.uniforms.uAspect.value = aspect;
      };
      fit();
      const ro = new ResizeObserver(fit); ro.observe(canvas);

      // the screen's outline on the page (GRID×GRID, viewport fractions), through the lens
      const outline = () => {
        const out = new Float32Array(GRID * GRID * 2);
        if (!screen) return out;
        const m = screen as import("three").Mesh;
        m.updateWorldMatrix(true, false);
        const g = m.geometry, P = g.getAttribute("position").array, UV = g.getAttribute("uv").array;
        const I = g.getIndex()?.array ?? null;
        const v3 = new THREE.Vector3();
        for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
          const cu = i / (GRID - 1), cv = j / (GRID - 1);            // picture point, v down
          // picture → texture (flipY) → mesh uv (undo repeat/offset)
          const mu = (cu - stex.offset.x) / stex.repeat.x, mv = (1 - cv - stex.offset.y) / stex.repeat.y;
          const [x, y, z] = pointAtUv(P, UV, I, mu, mv);
          v3.set(x, y, z).applyMatrix4(m.matrixWorld).project(camera);
          const [qx, qy] = lensInv(v3.x * aspect, v3.y, BEND);
          out[(j * GRID + i) * 2] = qx / aspect * 0.5 + 0.5;
          out[(j * GRID + i) * 2 + 1] = 0.5 - qy * 0.5;
        }
        return out;
      };

      let raf = 0, labels = "", shown = -1, prevShown = -1, changedAt = -1e9, retDone = !back;
      const t0 = performance.now();
      const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
      const hit = (cx: number, cy: number) => {
        const r = canvas.getBoundingClientRect();
        let q = [((cx - r.left) / r.width * 2 - 1) * aspect, 1 - ((cy - r.top) / r.height) * 2];
        const r2 = q[0] * q[0] + q[1] * q[1];
        q = q.map((v) => v * (1 + BEND * r2 + 0.11 * r2 * r2));             // through the lens
        ptr.set(q[0] / aspect, q[1]);
        ray.setFromCamera(ptr, camera);
        return ray.intersectObject(rig, true).length > 0;
      };
      const onClick = (e: MouseEvent) => { if (hit(e.clientX, e.clientY)) open(activeRef.current); };
      const onHover = (e: PointerEvent) => { canvas.dataset.hot = String(hit(e.clientX, e.clientY)); };
      canvas.addEventListener("click", onClick);
      canvas.addEventListener("pointermove", onHover);

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const t = (now - t0) / 1000;
        if (!reduced) { mx += (tx - mx) * 0.06; my += (ty - my) * 0.06; }
        // pinned behind the hero: labels come in once the ink has drained
        const sp = scrollY / innerHeight;
        const g = Math.min(1, Math.max(0, (sp - 0.34) / 0.3));
        const lab = g > 0.7 ? "on" : "off";
        if (lab !== labels) { labels = lab; section.dataset.labels = lab; }
        if (sp < 0.3 && !exitRef.current) return;                        // still under the hero

        const a = wrap(Math.round(targetRef.current));
        if (a !== shown) {
          if (shown >= 0) { prevShown = shown; changedAt = now; }
          shown = a; setActive(a);
        }
        const since = (now - changedAt) / 1000;
        const glitch = reduced ? 0 : Math.max(0, 1 - since / CHANGE_S);
        const ex = exitRef.current;
        const exitP = ex ? Math.min(1, (now - ex.t) / EXIT_MS) : 0;
        if (ex) section.dataset.exit = "true";
        // the screen: the old name breaks up, then the new one comes through the static
        const showing = since < CHANGE_S * 0.4 && prevShown >= 0 ? prevShown : shown;
        drawScreenFace(sg, projects[showing], showing, n, { t, glitch: ex ? 0 : glitch });
        stex.needsUpdate = true;

        // the computer turns toward the pointer, sways a little, and jolts on a channel change
        const jolt = glitch * Math.sin(since * 40) * 0.025;
        rig.rotation.y = mx * 0.32 + (reduced ? 0 : Math.sin(t * 0.4) * 0.04) + jolt;
        rig.rotation.x = -my * 0.07;
        rig.rotation.z = jolt * 0.5;

        renderer.setRenderTarget(rt);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        post.uniforms.uT.value = t;
        post.uniforms.uDrift.value = t * 0.004;
        post.uniforms.uKick.value = ex ? 0 : glitch * 0.6;
        post.uniforms.uClean.value = ex ? Math.min(1, exitP * 1.4) : back && !retDone ? 1 : 0;
        renderer.render(pscene, pcam);
        if (!retDone && since > 0) retDone = true;

        // our first frame is up: drop the still from the project page
        if (stillRef.current && stillRef.current.style.display === "block") stillRef.current.style.display = "none";
        // hand-off: a still of exactly this frame and where the screen is, then go
        if (ex && exitP >= 1 && goRef.current) {
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
        renderer.dispose(); rt.dispose();
      };
    })().catch((e) => console.warn("[showcase]", e));

    return () => {
      dead = true; stop();
      window.removeEventListener("wheel", onWheel);
      section.removeEventListener("touchstart", onTouchStart);
      section.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onPointer);
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
        <a className="brand" href="#top" aria-label={`${site.name}, back to top`}>
          <KLogo />
          {site.name}
        </a>
        <span className="sc__nav">
          <TvLink className="link" href="/about/">About</TvLink>
          <a className="link" href={`mailto:${site.email}`}>Contact</a>
        </span>
      </header>
      <nav className="sc__list" aria-label="Projects">
        <h2 id="work-title" className="sc__title sc__fade">Selected work</h2>
        {/* the computer shows the name; BMO shows the brief */}
        <div className="sc__fade">
          <BmoScreen
            show={{ no: `[${String(active + 1).padStart(2, "0")}]`, name: p.name, meta: `${p.type} · ${p.year}`, brief: p.summary }}
            onOpen={() => open(active)}
          />
        </div>
        <ol className="sc__nums">
          {projects.map((x, i) => (
            <li key={x.slug}>
              <button type="button" aria-current={i === active} onClick={() => (i === active ? open(i) : goTo(i))}>
                <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span className="sr-only">{x.name}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="sc__credit sc__fade">
          Models: computer{" "}
          <a href="https://sketchfab.com/3d-models/quadronic-250-computer-that-never-existed-b945947a2c1d4b18812abe59392f715a" target="_blank" rel="noopener noreferrer">Quadronic 250</a> by{" "}
          <a href="https://sketchfab.com/afbu" target="_blank" rel="noopener noreferrer">AfBu</a> (
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>), BMO by{" "}
          <a href="https://sketchfab.com/titaniumammas69" target="_blank" rel="noopener noreferrer">object</a> (
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>)
        </p>
      </nav>
      <p className="sc__summary sc__fade" aria-live="polite">
        <span>{p.type} · {p.year} · click the screen · scroll to change</span>
      </p>
    </section>
  );
}
