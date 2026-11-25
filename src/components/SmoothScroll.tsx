"use client";

import { useEffect } from "react";

/** How quickly the page catches up with the wheel (per second; lower = smoother and slower). */
const CATCH = 6;
/** Share of each wheel step that is scrolled (a little less than native, so it glides). */
const WHEEL = 0.9;

/**
 * Smooth wheel scrolling for the whole site (in the root layout), so the scroll-driven
 * animations play out evenly instead of in jumps. The wheel sets a target and the page eases
 * to it every frame. It stays out of the way of:
 * - handlers that already took the wheel (the home page's card wheel calls preventDefault),
 * - anything inside its own scroll box (the message field), pinch-zoom and sideways wheels,
 * - touch, keys, the scrollbar and scrollTo() calls (it picks up wherever the page is),
 * - reduced motion.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let target = scrollY, cur = scrollY, raf = 0, last = 0, ours = scrollY;
    const max = () => document.documentElement.scrollHeight - innerHeight;
    // a box between the target and the page that can scroll this way itself
    const scrollsItself = (el: EventTarget | null, dy: number) => {
      for (let n = el instanceof Element ? el : null; n && n !== document.body; n = n.parentElement) {
        const st = getComputedStyle(n);
        if (!/(auto|scroll)/.test(st.overflowY) || n.scrollHeight <= n.clientHeight) continue;
        if (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
      }
      return false;
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60); last = now;
      // someone else moved the page (keys, scrollbar, scrollTo): follow it and stop
      if (Math.abs(scrollY - ours) > 2) { raf = 0; return; }
      cur += (target - cur) * (1 - Math.exp(-dt * CATCH));
      if (Math.abs(target - cur) < 0.5) cur = target;
      ours = Math.round(cur);
      window.scrollTo({ top: cur, behavior: "instant" });
      ours = scrollY;
      raf = cur === target ? 0 : requestAnimationFrame(tick);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
      if (scrollsItself(e.target, dy)) return;
      e.preventDefault();
      if (!raf) { cur = scrollY; target = scrollY; ours = scrollY; last = performance.now(); }
      target = Math.max(0, Math.min(max(), target + dy * WHEEL));
      if (!raf) raf = requestAnimationFrame(tick);
    };
    // registered on the window after the pages' own handlers (effects run child-first), so
    // a page that takes the wheel has already said so
    addEventListener("wheel", onWheel, { passive: false });
    return () => { removeEventListener("wheel", onWheel); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
