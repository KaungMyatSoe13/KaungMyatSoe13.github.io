"use client";

import { useEffect, useRef, useState } from "react";
import { skills } from "@/content/about";
import { loadTv } from "@/lib/tvModel";
import { releaseGl } from "@/lib/releaseGl";
import { drawIcon } from "./AboutStory";

const SCREEN_W = 512, SCREEN_H = 384;

/**
 * "What I do" on phones / tablets (AboutStatic): the About page's old TV (tv.glb), showing the
 * chosen skill's icon on its screen like a TV channel. Light on purpose: it loads only when the
 * section comes near, draws only when the channel changes (a few frames of static, then the
 * picture; no animation loop), and a swipe across it changes the channel. Without WebGL, the
 * icon is drawn flat instead.
 */
export default function ChannelTv({ index, onSwipe }: { index: number; onSwipe: (dir: 1 | -1) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const show = useRef<(i: number) => void>(() => {});
  const swipe = useRef(onSwipe);
  swipe.current = onSwipe;
  const [flat, setFlat] = useState(false);
  const flatRef = useRef<HTMLCanvasElement>(null);
  const indexRef = useRef(index);

  useEffect(() => {
    const el = host.current!;
    let alive = true, stop = () => {};
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void start().catch(() => { if (alive) setFlat(true); });
    }, { rootMargin: "300px 0px" });
    io.observe(el);

    async function start() {
      const THREE = await import("three");
      if (!alive) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-3, 4, 5); scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(4, 2, -4); scene.add(rim);

      const sc = document.createElement("canvas"); sc.width = SCREEN_W; sc.height = SCREEN_H;
      const g = sc.getContext("2d")!;
      const tex = new THREE.CanvasTexture(sc);
      tex.colorSpace = THREE.SRGBColorSpace;
      const css = getComputedStyle(document.body);
      const dot = css.getPropertyValue("--font-dot").trim() || "monospace";
      const mono = css.getPropertyValue("--font-mono").trim() || "monospace";

      const tv = await loadTv(THREE, tex);
      if (!alive) { renderer.dispose(); return; }
      const rig = new THREE.Group(); rig.add(tv.model); scene.add(rig);
      rig.rotation.set(0.06, -0.38, 0);                    // a three-quarter view, like a photo
      el.appendChild(renderer.domElement);

      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        // far enough back that the TV (2 tall, aspect × 2 wide, turned) fits with a margin
        const half = Math.tan((camera.fov * Math.PI) / 360);
        const needH = 1.25 / half, needW = (tv.aspect * 1.15) / (half * camera.aspect);
        camera.position.set(0, 0.05, Math.max(needH, needW));
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      };

      // the icons, drawn once each, kept
      const icons = new Map<number, HTMLCanvasElement>();
      const iconOf = (i: number) => {
        let c = icons.get(i);
        if (!c) { c = document.createElement("canvas"); c.width = 500; c.height = 360; const x = c.getContext("2d")!; x.scale(0.5, 0.5); drawIcon(x, skills[i].icon); icons.set(i, c); }
        return c;
      };
      const scan = () => { g.fillStyle = "rgba(0,0,0,0.22)"; for (let y = 0; y < SCREEN_H; y += 3) g.fillRect(0, y, SCREEN_W, 1); };
      const picture = (i: number) => {
        g.fillStyle = "#0b100e"; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
        const glow = g.createRadialGradient(SCREEN_W / 2, SCREEN_H / 2, 20, SCREEN_W / 2, SCREEN_H / 2, SCREEN_W * 0.6);
        glow.addColorStop(0, "rgba(120,160,140,0.18)"); glow.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = glow; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
        g.save(); g.translate(SCREEN_W * 0.06, SCREEN_H * 0.06); g.scale(0.88, 0.88);   // inside the curved tube
        g.fillStyle = "#ece9e2"; g.textBaseline = "top"; g.globalAlpha = 0.9;
        g.font = `900 30px ${dot}`; g.fillText(`CH ${String(i + 1).padStart(2, "0")}`, 30, 22);
        g.font = `500 15px ${mono}`; g.textAlign = "right"; g.fillText(skills[i].name.toUpperCase(), SCREEN_W - 30, 30);
        g.textAlign = "left"; g.globalAlpha = 1;
        const ic = iconOf(i), w = SCREEN_W * 0.62, h = (w * ic.height) / ic.width;
        g.drawImage(ic, (SCREEN_W - w) / 2, (SCREEN_H - h) / 2 + 22, w, h);
        g.restore();
        scan();
      };
      const noise = () => {
        const img = g.createImageData(SCREEN_W / 4, SCREEN_H / 4), d = img.data;
        for (let k = 0; k < d.length; k += 4) { const v = Math.random() * 255; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; }
        const t = document.createElement("canvas"); t.width = SCREEN_W / 4; t.height = SCREEN_H / 4; t.getContext("2d")!.putImageData(img, 0, 0);
        g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, SCREEN_W, SCREEN_H); g.imageSmoothingEnabled = true;
        scan();
      };
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let timers: number[] = [];
      const draw = () => { tex.needsUpdate = true; renderer.render(scene, camera); };
      // a channel change: a few frames of static, then the picture
      show.current = (i: number) => {
        timers.forEach((t) => window.clearTimeout(t)); timers = [];
        if (reduced) { picture(i); draw(); return; }
        [0, 45, 90, 135].forEach((ms) => timers.push(window.setTimeout(() => { noise(); draw(); }, ms)));
        timers.push(window.setTimeout(() => { picture(i); draw(); }, 190));
      };
      try { await renderer.compileAsync(scene, camera); } catch {}
      if (!alive) { renderer.dispose(); return; }
      await (document.fonts?.ready ?? Promise.resolve());
      picture(indexRef.current); tex.needsUpdate = true;
      fit();
      const ro = new ResizeObserver(fit); ro.observe(el);
      stop = () => {
        ro.disconnect(); timers.forEach((t) => window.clearTimeout(t));
        renderer.dispose(); renderer.domElement.remove(); releaseGl(renderer.domElement, 0);
      };
    }

    // a swipe across the TV changes the channel (vertical moves still scroll the page)
    let x0 = 0, y0 = 0, on = false;
    const down = (e: PointerEvent) => { on = true; x0 = e.clientX; y0 = e.clientY; };
    const up = (e: PointerEvent) => {
      if (!on) return; on = false;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) swipe.current(dx < 0 ? 1 : -1);
    };
    const cancel = () => { on = false; };
    el.addEventListener("pointerdown", down); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", cancel);
    return () => {
      alive = false; io.disconnect(); stop();
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", cancel);
    };
  }, []);

  // the channel follows `index`
  const first = useRef(true);
  useEffect(() => {
    indexRef.current = index;
    if (first.current) { first.current = false; return; }
    show.current(index);
  }, [index]);

  // no WebGL: the icon, flat
  useEffect(() => {
    const c = flatRef.current;
    if (!flat || !c) return;
    const x = c.getContext("2d"); if (!x) return;
    x.clearRect(0, 0, c.width, c.height); drawIcon(x, skills[index].icon);
  }, [flat, index]);

  return (
    <div ref={host} className="abs__tv" role="img" aria-label={`An old TV showing channel ${index + 1}: ${skills[index].name}. Swipe it to change the channel.`}>
      {flat && <canvas ref={flatRef} className="abs__icon" width={1000} height={720} aria-hidden="true" />}
    </div>
  );
}
