"use client";

import { useEffect, useRef } from "react";
import { READY_EVENT, beginScatter, scatter } from "@/lib/scatter";

/*
 * A full-screen canvas in the root layout (it survives page changes). While a particle
 * hand-off is active it draws the scattered particles, so there is never an empty frame
 * between the old page's particles and the new page's. When the new page reports it is
 * drawing (READY_EVENT), this layer fades out and the hand-off ends.
 *
 * It can also run a "leave" itself (used by the project page's back links): it builds
 * particles from the image and title on screen, sends them flying across the screen,
 * and then calls `go()` to change page.
 */

type Leave = { sources: { el: HTMLElement; img?: HTMLImageElement; dark?: boolean }[]; go: () => void };
let requestLeave: ((l: Leave) => void) | null = null;

/** Burst the given elements into particles, then navigate (project page → home). */
export function leaveWithParticles(l: Leave) {
  if (requestLeave) requestLeave(l);
  else l.go();
}

export default function TransitionLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let dpr = 1;
    const fit = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    fit();
    window.addEventListener("resize", fit);

    let styles: string[] | null = null; // per-particle colours for image particles
    let fade = 1;      // 1 = fully visible, eases to 0 once the next page is ready
    let fading = false;
    let raf = 0;
    // "leave" animation state (positions fly from source to random spots)
    let lv: { sx: Float32Array; sy: Float32Array; tx: Float32Array; ty: Float32Array; t0: number; dur: number; go: () => void; went: boolean } | null = null;

    const onReady = () => { if (scatter.active) fading = true; };
    window.addEventListener(READY_EVENT, onReady);

    requestLeave = ({ sources, go }) => {
      // Sample each source element into coloured particles at its on-screen position.
      const xs: number[] = [], ys: number[] = [], rs: number[] = [], gs: number[] = [], bs: number[] = [];
      const STEP = 4;
      for (const s of sources) {
        const r = s.el.getBoundingClientRect();
        const cols = Math.max(1, Math.round(r.width / STEP)), rows = Math.max(1, Math.round(r.height / STEP));
        const off = document.createElement("canvas");
        off.width = cols; off.height = rows;
        const oc = off.getContext("2d", { willReadFrequently: true })!;
        if (s.img) {
          oc.drawImage(s.img, 0, 0, cols, rows);
        } else {
          // text: draw the element's text in its own font
          const cs = getComputedStyle(s.el);
          oc.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) / STEP}px ${cs.fontFamily}`;
          oc.textBaseline = "middle";
          oc.fillStyle = "#0e0e0e";
          oc.fillText(s.el.textContent ?? "", 0, rows / 2);
        }
        const d = oc.getImageData(0, 0, cols, rows).data;
        for (let j = 0; j < rows; j++)
          for (let i = 0; i < cols; i++) {
            const k = (j * cols + i) * 4;
            if (d[k + 3] < 100) continue;
            xs.push(r.left + (i + 0.5) * STEP); ys.push(r.top + (j + 0.5) * STEP);
            rs.push(d[k] / 255); gs.push(d[k + 1] / 255); bs.push(d[k + 2] / 255);
          }
        s.el.style.transition = "opacity 0.15s ease";
        s.el.style.opacity = "0";
      }
      // Keep the count close to what the names page uses, so density stays even.
      const n = Math.min(xs.length, 30000);
      const pick = new Uint32Array(n);
      for (let k = 0; k < n; k++) pick[k] = Math.floor((k / n) * xs.length);
      const sx = new Float32Array(n), sy = new Float32Array(n), tx = new Float32Array(n), ty = new Float32Array(n);
      beginScatter(n);
      styles = new Array(n);
      const vw = window.innerWidth, vh = window.innerHeight;
      for (let k = 0; k < n; k++) {
        const i = pick[k];
        sx[k] = xs[i]; sy[k] = ys[i];
        tx[k] = Math.random() * vw; ty[k] = Math.random() * vh;
        scatter.r[k] = rs[i]; scatter.g[k] = gs[i]; scatter.b[k] = bs[i];
        scatter.x[k] = sx[k]; scatter.y[k] = sy[k];
        styles![k] = `rgb(${(rs[i] * 255) | 0},${(gs[i] * 255) | 0},${(bs[i] * 255) | 0})`;
      }
      lv = { sx, sy, tx, ty, t0: performance.now(), dur: 750, go, went: false };
      fade = 1; fading = false;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (lv) {
        const a = Math.min(1, (now - lv.t0) / lv.dur);
        const e = 1 - Math.pow(1 - a, 3);
        for (let k = 0; k < scatter.n; k++) {
          scatter.x[k] = lv.sx[k] + (lv.tx[k] - lv.sx[k]) * e;
          scatter.y[k] = lv.sy[k] + (lv.ty[k] - lv.sy[k]) * e;
        }
        if (a >= 1 && !lv.went) { lv.went = true; scatter.t = performance.now(); lv.go(); }
        if (a >= 1) lv = null;
      }
      if (!scatter.active) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      if (fading) {
        fade -= 0.12;
        if (fade <= 0) { scatter.active = false; fade = 1; fading = false; ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = fade;
      if (scatter.ink || !styles) {
        ctx.fillStyle = "#0e0e0e";
        for (let k = 0; k < scatter.n; k++) ctx.fillRect(scatter.x[k] - 0.75, scatter.y[k] - 0.75, 1.5, 1.5);
      } else {
        for (let k = 0; k < scatter.n; k++) {
          ctx.fillStyle = styles[k];
          ctx.fillRect(scatter.x[k] - 0.75, scatter.y[k] - 0.75, 1.5, 1.5);
        }
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      requestLeave = null;
      window.removeEventListener("resize", fit);
      window.removeEventListener(READY_EVENT, onReady);
    };
  }, []);

  return <canvas ref={canvasRef} className="transition-layer" aria-hidden="true" />;
}
