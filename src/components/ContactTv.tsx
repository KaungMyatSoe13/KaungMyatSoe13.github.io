"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

/** What the TV shows: the message being typed, or the state of the send. */
export type TvScreen = { name: string; msg: string; state: "idle" | "sending" | "sent" };

const SCREEN_W = 512, SCREEN_H = 384;

/** Word-wrap `text` to lines that fit `max` px. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/**
 * The old TV (glTF model, CC BY 4.0, credited on the page) beside the contact form. Its
 * screen is a canvas: static and "NO SIGNAL" until you type, then your message, teletext style.
 * three.js loads only when the section comes near.
 */
export default function ContactTv({ screen, turn }: { screen: MutableRefObject<TvScreen>; turn: { x: number; y: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current!;
    let stop = () => {};
    let started = false;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started) return;
      started = true;
      io.disconnect();
      void start();
    }, { rootMargin: "60% 0px" });
    io.observe(host);

    async function start() {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      host.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
      camera.position.set(0, 0.15, 6.2);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-3, 4, 5); scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(4, 2, -4); scene.add(rim);

      // the screen picture
      const sc = document.createElement("canvas"); sc.width = SCREEN_W; sc.height = SCREEN_H;
      const g = sc.getContext("2d", { willReadFrequently: true })!;
      const tex = new THREE.CanvasTexture(sc);
      tex.colorSpace = THREE.SRGBColorSpace;
      const dot = getComputedStyle(document.body).getPropertyValue("--font-dot").trim() || "monospace";
      const mono = getComputedStyle(document.body).getPropertyValue("--font-mono").trim() || "monospace";

      const rig = new THREE.Group(); scene.add(rig);
      const gltf = await new GLTFLoader().loadAsync("/about/tv.glb");
      const model = gltf.scene;
      // centre it and make it 2 units tall
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const s = 2 / size.y;
      model.scale.setScalar(s);
      model.position.copy(mid.multiplyScalar(-s));
      rig.add(model);
      model.traverse((o) => {
        const m = o as import("three").Mesh;
        if (!m.isMesh || !/^Plane/.test(m.name)) return;
        // the screen's UVs cover only part of 0..1: stretch the picture over exactly that part
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

      // drag to turn it (with a little throw); it keeps the angle you leave it at
      const spin = { yaw: 0, pitch: 0, vy: 0, vp: 0, drag: false, x: 0, y: 0, at: 0 };
      const down = (e: PointerEvent) => { spin.drag = true; spin.x = e.clientX; spin.y = e.clientY; host.setPointerCapture(e.pointerId); host.dataset.drag = "on"; };
      const move = (e: PointerEvent) => {
        if (!spin.drag) return;
        spin.vy = (e.clientX - spin.x) * 0.012; spin.vp = (e.clientY - spin.y) * 0.008;
        spin.x = e.clientX; spin.y = e.clientY;
        spin.yaw += spin.vy; spin.pitch = Math.max(-0.6, Math.min(0.6, spin.pitch + spin.vp));
      };
      const up = () => { spin.drag = false; spin.at = performance.now(); delete host.dataset.drag; };
      host.addEventListener("pointerdown", down);
      host.addEventListener("pointermove", move);
      host.addEventListener("pointerup", up);
      host.addEventListener("pointercancel", up);
      let raf = 0, last = 0;
      const t0 = performance.now();
      const draw = (t: number) => {
        const { name, msg, state } = screen.current;
        g.fillStyle = "#0c0e0d"; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
        const typing = msg.trim() || name.trim();
        // static: heavy while nothing is tuned in, a light snow over the picture
        const snow = state === "sending" ? 0.5 : typing ? 0.06 : 0.35;
        const img = g.getImageData(0, 0, SCREEN_W, SCREEN_H), d = img.data;
        for (let k = 0; k < d.length; k += 4) {
          const v = Math.random() < snow ? Math.random() * 200 : 0;
          d[k] += v; d[k + 1] += v; d[k + 2] += v;
        }
        g.putImageData(img, 0, 0);
        g.fillStyle = "#ece9e2"; g.textBaseline = "top";
        g.save(); g.translate(SCREEN_W * 0.06, SCREEN_H * 0.08); g.scale(0.88, 0.86);   // inside the curved tube
        g.font = `900 30px ${dot}`;
        g.fillText("CH 05", 34, 28);
        g.font = `500 16px ${mono}`;
        g.fillText(state === "sending" ? "SENDING" : state === "sent" ? "SENT" : typing ? "● REC" : "", 380, 36);
        const blink = Math.floor(t * 2) % 2 === 0;
        if (state === "sending") {
          g.font = `900 46px ${dot}`; g.fillText("SENDING" + ".".repeat(Math.floor(t * 4) % 4), 34, 160);
        } else if (state === "sent") {
          g.font = `900 46px ${dot}`; g.fillText("THANK YOU", 34, 150);
          g.font = `500 18px ${mono}`; g.fillText("Talk soon.", 36, 214);
        } else if (!typing) {
          if (blink) { g.font = `900 52px ${dot}`; g.fillText("NO SIGNAL", 34, 150); }
          g.font = `500 17px ${mono}`; g.fillText("Type a message to tune in", 36, 226);
        } else {
          g.font = `500 16px ${mono}`;
          g.fillText(`FROM: ${name.toUpperCase().slice(0, 30)}`, 36, 86);
          g.font = `800 26px ${dot}`;
          const lines = wrap(g, msg, SCREEN_W - 72).slice(-7);
          lines.forEach((l, i) => g.fillText(l + (i === lines.length - 1 && blink ? "_" : ""), 34, 124 + i * 34));
        }
        g.restore();
        // scanlines and a soft rolling band
        g.fillStyle = "rgba(0,0,0,0.28)";
        for (let y = 0; y < SCREEN_H; y += 3) g.fillRect(0, y, SCREEN_W, 1);
        const band = ((t * 60) % (SCREEN_H + 80)) - 40;
        g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(0, band, SCREEN_W, 26);
        tex.needsUpdate = true;
      };

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const t = (now - t0) / 1000;
        if (now - last > 1000 / 24) { draw(t); last = now; }   // the picture runs at TV-ish 24 fps
        const sway = reduced ? 0 : Math.sin(t * 0.5) * 0.12;
        if (!spin.drag) {                                         // the throw dies out
          spin.yaw += spin.vy; spin.vy *= 0.88;
          spin.pitch = Math.max(-0.6, Math.min(0.6, spin.pitch + spin.vp)); spin.vp *= 0.85;
          // a while after you let go it turns back to face you (the screen shows your message)
          if (now - spin.at > 2500) {
            const home = Math.round(spin.yaw / (Math.PI * 2)) * Math.PI * 2;
            spin.yaw += (home - spin.yaw) * 0.03; spin.pitch *= 0.97;
          }
        }
        rig.rotation.y = -0.45 + sway + turn.x * 0.25 + spin.yaw;
        rig.rotation.x = 0.06 - turn.y * 0.08 + spin.pitch;
        rig.position.y = reduced ? 0 : Math.sin(t * 0.8) * 0.03;
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);
      stop = () => {
        cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove();
        host.removeEventListener("pointerdown", down); host.removeEventListener("pointermove", move);
        host.removeEventListener("pointerup", up); host.removeEventListener("pointercancel", up);
      };
    }
    return () => { io.disconnect(); stop(); };
  }, [screen, turn]);
  return (
    <>
      <div ref={ref} className="ab__tv3d" role="img" aria-label="An old TV that shows your message as you type. Drag to turn it." />
      <p className="ab__tv-hint" aria-hidden="true">↻ Drag to turn</p>
    </>
  );
}
