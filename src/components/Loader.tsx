"use client";

import { useEffect, useRef, useState } from "react";
import { loading } from "@/lib/loading";

/** At least this long on screen, so it never just flashes (ms). */
const MIN_MS = 1400;
/** Give up waiting after this long and show the page anyway (ms). */
const MAX_MS = 20000;

/**
 * The first-load counter (root layout; server-rendered, so it covers the page from the first
 * paint). It counts 1 → 100 from the real progress of what the page registered in
 * `loading` (models, images, first frame) plus window load, climbing from the bottom-right
 * corner to the top-right as it goes; at 100 it glitches away and the page is ready behind it.
 * Scrolling is held while it shows. Page changes later in the visit don't show it again.
 */
export default function Loader() {
  const [gone, setGone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = root.current!, n = num.current!;
    loading.track("fonts", document.fonts?.ready ?? Promise.resolve(), 0.5);
    // hold the page still meanwhile (capture: before the pages' own wheel / key handlers)
    const hold = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    const keys = (e: KeyboardEvent) => { if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(e.key)) hold(e); };
    addEventListener("wheel", hold, { capture: true, passive: false });
    addEventListener("touchmove", hold, { capture: true, passive: false });
    addEventListener("keydown", keys, { capture: true });
    const release = () => {
      removeEventListener("wheel", hold, { capture: true });
      removeEventListener("touchmove", hold, { capture: true });
      removeEventListener("keydown", keys, { capture: true });
    };
    let loaded = document.readyState === "complete";
    const onLoad = () => { loaded = true; };
    addEventListener("load", onLoad);
    const t0 = performance.now();
    let shown = 0, raf = 0, endAt = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const age = now - t0;
      // window load counts as a fifth of the work; the pages' own tasks the rest
      const real = 0.2 * (loaded ? 1 : 0.5) + 0.8 * (loading.count() ? loading.progress() : age > 1500 ? 1 : 0);
      const ready = (loaded && loading.allDone() && age > MIN_MS) || age > MAX_MS;
      const target = ready ? 100 : Math.min(99, Math.floor(real * 100));
      // count up steadily (never jumps, never runs ahead of the real progress)
      if (shown < target) shown = Math.min(target, shown + Math.max(0.35, (target - shown) * 0.08));
      const v = Math.max(1, Math.floor(shown));
      n.textContent = String(v);
      el.style.setProperty("--k", (v / 100).toFixed(3));
      if (v >= 100 && !endAt) {
        endAt = now;
        loading.finish();
        el.dataset.leaving = "true";
        release();
        window.setTimeout(() => setGone(true), 520);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); release(); removeEventListener("load", onLoad); };
  }, []);
  if (gone) return null;
  return (
    <div ref={root} className="loader" role="progressbar" aria-label="Loading" aria-valuemin={1} aria-valuemax={100}>
      <p className="loader__count"><span ref={num}>1</span><small>%</small></p>
      <p className="loader__label">Loading</p>
    </div>
  );
}
