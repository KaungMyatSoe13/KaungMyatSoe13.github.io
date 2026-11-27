"use client";

import { useEffect } from "react";

/**
 * Real-device testing helper. ONLY active when the site is opened from a local-network address
 * (e.g. http://192.168.1.126:3000 on a phone on the same Wi-Fi), never on the live site: it sends
 * errors, WebGL context losses, the device's screen facts and a frames-per-second sample to a log
 * receiver on the Mac (port 3999). Remove it once the phone issues are fixed.
 */
export default function DevReport() {
  useEffect(() => {
    if (!/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)) return;
    const url = `http://${location.hostname}:3999/log`;
    const send = (kind: string, data: unknown) => {
      try {
        const body = JSON.stringify({ kind, path: location.pathname, y: Math.round(scrollY), data });
        if (!navigator.sendBeacon?.(url, body)) void fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
      } catch {}
    };
    const str = (a: unknown) => (a instanceof Error ? `${a.name}: ${a.message} @ ${(a.stack ?? "").split("\n").slice(0, 3).join(" < ")}` : typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })());
    send("hello", {
      ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
      gl2: !!document.createElement("canvas").getContext("webgl2"),
      vv: window.visualViewport ? [Math.round(visualViewport!.width), Math.round(visualViewport!.height)] : null,
    });
    const onErr = (e: ErrorEvent) => send("error", `${e.message} ${e.filename?.split("/").pop()}:${e.lineno}:${e.colno} ${str(e.error)}`);
    const onRej = (e: PromiseRejectionEvent) => send("rejection", str(e.reason));
    const onLost = (e: Event) => send("webgl-lost", (e.target as HTMLElement)?.className || "canvas");
    addEventListener("error", onErr);
    addEventListener("unhandledrejection", onRej);
    document.addEventListener("webglcontextlost", onLost, true);
    const ce = console.error, cw = console.warn;
    console.error = (...a: unknown[]) => { send("console.error", a.map(str).join(" ").slice(0, 1500)); ce(...a); };
    console.warn = (...a: unknown[]) => { send("console.warn", a.map(str).join(" ").slice(0, 800)); cw(...a); };
    // frames per second, every 4 s, with how many canvases are on the page
    let frames = 0, raf = 0, t0 = performance.now(), worst = 0, last = t0;
    const tick = (now: number) => {
      frames++; worst = Math.max(worst, now - last); last = now;
      if (now - t0 > 4000) {
        send("fps", { fps: Math.round((frames * 1000) / (now - t0)), worstFrameMs: Math.round(worst), canvases: document.querySelectorAll("canvas").length });
        frames = 0; t0 = now; worst = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      removeEventListener("error", onErr); removeEventListener("unhandledrejection", onRej);
      document.removeEventListener("webglcontextlost", onLost, true);
      console.error = ce; console.warn = cw; cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
