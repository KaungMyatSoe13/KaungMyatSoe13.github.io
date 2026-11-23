"use client";

import { useEffect, useRef } from "react";

/**
 * Custom pointer: a small dot that sits exactly on the mouse, and a thin ring that glides
 * after it. The ring grows over links and buttons and tightens on click. Only on devices
 * with a precise pointer (mouse / trackpad); touch screens keep their normal behaviour.
 */
export default function Cursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const ring = ringRef.current!, dot = dotRef.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    root.classList.add("has-cursor");

    let x = -100, y = -100, rx = -100, ry = -100, raf = 0, seen = false;
    const onMove = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      if (!seen) { rx = x; ry = y; seen = true; root.classList.add("cursor-on"); }
      const t = e.target as Element | null;
      ring.dataset.hover = String(!!t?.closest("a, button, [role='button'], .work-row__name, [data-hot='true']"));
    };
    const onDown = () => { ring.dataset.down = "true"; };
    const onUp = () => { ring.dataset.down = "false"; };
    const onLeave = () => root.classList.remove("cursor-on");
    const onEnter = () => { if (seen) root.classList.add("cursor-on"); };

    const tick = () => {
      const k = reduced ? 1 : 0.2;
      rx += (x - rx) * k; ry += (y - ry) * k;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);
    return () => {
      cancelAnimationFrame(raf);
      root.classList.remove("has-cursor", "cursor-on");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
    };
  }, []);

  return (
    <div className="cursor" aria-hidden="true">
      <div ref={ringRef} className="cursor__ring">
        <span />
      </div>
      <div ref={dotRef} className="cursor__dot">
        <span />
      </div>
    </div>
  );
}
