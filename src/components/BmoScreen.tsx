"use client";

import { useEffect, useRef, useState } from "react";

/** What BMO's face shows: the current project. */
export type BmoShow = { no: string; name: string; meta: string; brief?: string };

const SW = 640, SH = 480;
const SCREEN = "#cfe9d3", INK = "#1f4e47";

/** Break a name into at most 3 lines that fit `max` px, shrinking the font until they do. */
function fitName(g: CanvasRenderingContext2D, name: string, max: number, font: (px: number) => string) {
  for (let px = 92; px >= 34; px -= 4) {
    g.font = font(px);
    const lines: string[] = [];
    let line = "";
    for (const w of name.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t;
    }
    lines.push(line);
    if (lines.length <= 3 && lines.every((l) => g.measureText(l).width <= max)) return { px, lines };
  }
  return { px: 34, lines: [name] };
}

/* Kept between pages (client-side navigation keeps modules alive): three.js and the model
   load once; the last frame drawn is handed to the next BMO so it is there at once; the
   pointer is shared so BMO keeps looking the same way across the switch. */
type Lib = { THREE: typeof import("three"); gltf: import("three/examples/jsm/loaders/GLTFLoader.js").GLTF; clone: (o: import("three").Object3D) => import("three").Object3D };
let lib: Promise<Lib> | null = null;
function loadBmo() {
  lib ??= (async () => {
    const [THREE, { GLTFLoader }, { clone }] = await Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/utils/SkeletonUtils.js"),
    ]);
    const gltf = await new GLTFLoader().loadAsync("/showcase/bmo.glb");
    return { THREE, gltf, clone };
  })();
  return lib;
}
let lastFrame: string | null = null;
const ptr = { x: 0, y: 0, sx: 0, sy: 0 };

/**
 * BMO (glTF, CC BY 4.0, credited on the page) standing beside the project screens. Its face
 * is a canvas: the current project's number and name, with a small glitch on every change.
 * The first time, three.js and the model load after the page has finished loading.
 * `ghost`: the copy inside the project page's ghost of the home text; it only draws while
 * that ghost is visible, so it is ready (and current) when the page closes.
 */
export default function BmoScreen({ show, onOpen, ghost = false }: { show: BmoShow; onOpen?: () => void; ghost?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [still] = useState(() => (typeof window === "undefined" ? null : lastFrame));
  const showRef = useRef(show);
  const changed = useRef(0);
  useEffect(() => {
    if (showRef.current.name !== show.name) changed.current = performance.now();
    showRef.current = show;
  }, [show]);

  useEffect(() => {
    const host = ref.current!;
    let stop = () => {}, dead = false;
    const go = () => { if (!dead) void start(); };
    // after the first visit (or on a project page) there is no reason to wait
    if (lib || ghost || document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });

    async function start() {
      const { THREE, gltf, clone } = await loadBmo();
      if (dead) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      host.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
      camera.position.set(0, 0.1, 6.4);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f8c, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 4, 5); scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(4, 2, -3); scene.add(rim);

      // the face
      // drawn upright on `sc`, then turned a quarter onto `tc` (the model's screen UVs are rotated)
      const sc = document.createElement("canvas"); sc.width = SW; sc.height = SH;
      const g = sc.getContext("2d")!;
      const tc = document.createElement("canvas"); tc.width = SH; tc.height = SW;
      const tg = tc.getContext("2d")!;
      const tex = new THREE.CanvasTexture(tc);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const css = getComputedStyle(document.body);
      const dot = css.getPropertyValue("--font-dot").trim() || "monospace";
      const mono = css.getPropertyValue("--font-mono").trim() || "monospace";
      const sans = css.getPropertyValue("--font-sans").trim() || "sans-serif";

      const rig = new THREE.Group(); scene.add(rig);
      const model = clone(gltf.scene);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const s = 2.3 / size.y;
      model.scale.setScalar(s);
      model.position.copy(mid.multiplyScalar(-s));
      rig.add(model);
      model.traverse((o) => {
        const m = o as import("three").Mesh;
        if (!m.isMesh || !/BMOscreen/.test(m.name)) return;
        // the face's UVs cover only part of 0..1: stretch the picture over exactly that part
        const uv = m.geometry.getAttribute("uv");
        let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
        for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
        tex.repeat.set(1 / (u1 - u0), 1 / (v1 - v0));
        tex.offset.set(-u0 / (u1 - u0), -v0 / (v1 - v0));
        m.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      });

      const fit = () => {
        const w = host.clientWidth, h = host.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit); ro.observe(host);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const onMove = (e: PointerEvent) => { ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = (e.clientY / innerHeight) * 2 - 1; };
      addEventListener("pointermove", onMove, { passive: true });

      const draw = (t: number, since: number) => {
        const { no, name, meta } = showRef.current;
        g.fillStyle = SCREEN; g.fillRect(0, 0, SW, SH);
        g.fillStyle = INK; g.textBaseline = "top";
        const pad = 56;
        g.font = `800 30px ${dot}`; g.fillText(no, pad, 46);
        g.font = `500 20px ${mono}`;
        const mw = g.measureText(meta.toUpperCase()).width;
        g.fillText(meta.toUpperCase(), SW - pad - mw, 52);
        const { brief } = showRef.current;
        if (brief) {
          // the brief, in plain type, as many lines as it needs (up to 5)
          let bp = 44, bl: string[] = [];
          for (; bp >= 24; bp -= 2) {
            g.font = `600 ${bp}px ${sans}`;
            bl = [];
            let line = "";
            for (const w of brief.split(" ")) { const t2 = line ? `${line} ${w}` : w; if (g.measureText(t2).width > SW - pad * 2 && line) { bl.push(line); line = w; } else line = t2; }
            bl.push(line);
            if (bl.length <= 5) break;
          }
          const blh = bp * 1.18, btop = (SH - bl.length * blh) / 2 + 8;
          bl.forEach((l, i) => g.fillText(l, pad, btop + i * blh));
        } else {
          const { px, lines } = fitName(g, name.toUpperCase(), SW - pad * 2, (p) => `900 ${p}px ${dot}`);
          g.font = `900 ${px}px ${dot}`;
          const lh = px * 1.02, top = (SH - lines.length * lh) / 2 + 6;
          lines.forEach((l, i) => g.fillText(l, pad, top + i * lh));
        }
        // a small face in the corner: eyes blink now and then, the mouth smiles
        const fx = SW - pad - 54, fy = SH - 74, blink = Math.sin(t * 0.9) > 0.985;
        if (blink) { g.fillRect(fx, fy + 6, 14, 3); g.fillRect(fx + 40, fy + 6, 14, 3); }
        else { g.beginPath(); g.arc(fx + 7, fy + 7, 6, 0, Math.PI * 2); g.arc(fx + 47, fy + 7, 6, 0, Math.PI * 2); g.fill(); }
        g.lineWidth = 4; g.strokeStyle = INK; g.beginPath(); g.arc(fx + 27, fy + 14, 14, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
        // LCD lines
        g.fillStyle = "rgba(31,78,71,0.06)";
        for (let y = 0; y < SH; y += 4) g.fillRect(0, y, SW, 2);
        // just changed: slices jump sideways for a moment, like a bad signal
        if (since < 0.38 && !reduced) {
          const strength = 1 - since / 0.38;
          for (let k = 0; k < 7; k++) {
            const y = Math.random() * SH, h = 8 + Math.random() * 46, dx = (Math.random() - 0.5) * 120 * strength;
            g.drawImage(sc, 0, y, SW, h, dx, y, SW, h);
          }
          g.fillStyle = `rgba(31,78,71,${0.15 * strength})`; g.fillRect(0, Math.random() * SH, SW, 6);
        }
        tg.setTransform(0, 1, -1, 0, SH, 0);                      // a quarter turn clockwise
        tg.drawImage(sc, 0, 0);
        tex.needsUpdate = true;
      };

      let raf = 0, last = 0, drawn = false;
      const t0 = performance.now();
      const ghostEl = ghost ? host.closest<HTMLElement>(".sc--ghost") : null;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (now - last < 1000 / 40) return;                       // 40 fps is plenty here
        if (drawn && ghostEl && parseFloat(getComputedStyle(ghostEl).opacity) < 0.01) return;
        last = now;
        const t = (now - t0) / 1000, since = (now - changed.current) / 1000;
        draw(t, since);
        ptr.sx += (ptr.x - ptr.sx) * 0.06; ptr.sy += (ptr.y - ptr.sy) * 0.06;
        // looks toward the pointer, sways a little, and hops when the project changes
        const hop = !reduced && since < 0.5 ? Math.sin((since / 0.5) * Math.PI) * 0.12 : 0;
        rig.rotation.y = 0.35 + ptr.sx * 0.35 + (reduced ? 0 : Math.sin(t * 0.6) * 0.05);
        rig.rotation.x = ptr.sy * 0.12;
        rig.position.y = hop + (reduced ? 0 : Math.sin(t * 1.3) * 0.02);
        renderer.render(scene, camera);
        if (!drawn) { drawn = true; host.dataset.ready = "on"; }  // the still can go
      };
      raf = requestAnimationFrame(frame);
      stop = () => {
        cancelAnimationFrame(raf); ro.disconnect(); removeEventListener("pointermove", onMove);
        // hand this frame to the next BMO (drawn again so the buffer is fresh to read)
        if (drawn) { renderer.render(scene, camera); try { lastFrame = renderer.domElement.toDataURL("image/png"); } catch {} }
        renderer.dispose(); renderer.domElement.remove();
      };
    }
    return () => { dead = true; stop(); };
  }, [ghost]);

  return (
    <div
      ref={ref}
      className="sc__bmo"
      role={ghost ? undefined : "button"}
      tabIndex={ghost ? undefined : -1}
      aria-label={ghost ? undefined : `Open ${show.name}`}
      onClick={onOpen}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {still && <img className="sc__bmo-still" src={still} alt="" aria-hidden="true" />}
    </div>
  );
}
