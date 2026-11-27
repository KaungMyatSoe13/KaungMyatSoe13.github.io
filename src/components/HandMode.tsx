"use client";

import { useEffect, useRef, useState } from "react";
import { startHand } from "@/lib/hand";
import { music } from "@/lib/music";

const CONN = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
// "️" asks for the colour emoji: ☝ and ✌ otherwise show as plain text symbols
const ICON: Record<string, string> = { point: "☝️", peace: "✌️", pinch: "\u{1F90F}", fist: "✊", open: "✋" };
const LEGEND: [string, string][] = [
  ["point", "point = move the cursor"],
  ["peace", "peace sign = click"],
  ["pinch", "pinch = grab / drag"],
  ["fist", "fist up / down = scroll"],
  ["open", "hold = close / back"],
];
const FIST_STEP = 0.08, FIST_REPEAT = 650; // showcase fist joystick: reach (screen heights), repeat (ms)

/**
 * "Hand mode": control the site with your hand in front of the webcam (off until the visitor
 * clicks the button; the browser then asks for the camera). The hand is tracked in the browser
 * (src/lib/hand.ts), the video never leaves the device. Gestures become the events the site
 * already understands, so every page works without changes:
 *  ☝ point = the pointer (pointermove) · ✌ peace sign = click · 🤏 pinch = button held (drag)
 *  ✊ fist up/down = scroll (wheel; on the home showcase a joystick: push and hold = next cards)
 *  ✋ hold = close (chat, viewer, project page) or, on About, back to the showcase
 *  The cursor moves only while pointing or pinching.
 */
export default function HandMode() {
  const [show, setShow] = useState(false);
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState("");
  const [gesture, setGesture] = useState("");
  const video = useRef<HTMLVideoElement>(null), skel = useRef<HTMLCanvasElement>(null), dot = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // hidden on touch-only devices (they have touch)
  // desktop only: never on phones or tablets (touch screens, small windows, iPads with a trackpad)
  useEffect(() => {
    const desk = () => matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1025px)").matches
      && !matchMedia("(any-pointer: coarse)").matches && navigator.maxTouchPoints < 2;
    const upd = () => setShow(desk() && !!navigator.mediaDevices?.getUserMedia);
    upd();
    addEventListener("resize", upd);
    return () => removeEventListener("resize", upd);
  }, []);

  const turnOff = () => {
    stopRef.current?.(); stopRef.current = null;
    document.documentElement.removeAttribute("data-hand");
    setOn(false); setGesture("");
  };
  useEffect(() => () => { stopRef.current?.(); document.documentElement.removeAttribute("data-hand"); }, []);
  // keys: H turns Hand mode on / off, Esc turns it off (not while typing in a field)
  const onRef = useRef(false), startingRef = useRef(false);
  onRef.current = on;
  useEffect(() => {
    if (!show) return;
    const k = (e: KeyboardEvent) => {
      if (!e.isTrusted || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "Escape" && onRef.current) turnOff();
      else if (e.key === "h" || e.key === "H") {
        music.blip();
        if (onRef.current) turnOff(); else if (!startingRef.current) void turnOn();
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [show]);

  const turnOn = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setMsg("Starting… allow the camera when your browser asks.");
    // state of the virtual pointer
    // ✌ peace sign = click; 🤏 pinch = the left button held down (drag / turn things) until it opens
    let px = innerWidth / 2, py = innerHeight / 2, under: Element | null = null, downAt: { x: number; y: number } | null = null, down: Element | null = null;
    // fist joystick on the home showcase: past FIST_STEP = one card, then one more every FIST_REPEAT
    let stickDir = 0, stickNext = 0;
    const target = () => document.elementFromPoint(px, py);
    const ptr = (type: string, el: Element | Window | null, extra: PointerEventInit = {}) =>
      (el ?? window).dispatchEvent(new PointerEvent(type, { clientX: px, clientY: py, pointerType: "mouse", pointerId: 1, isPrimary: true, bubbles: true, cancelable: true, view: window, ...extra }));
    const mouse = (type: string, el: Element | null, extra: MouseEventInit = {}) =>
      (el ?? document.body).dispatchEvent(new MouseEvent(type, { clientX: px, clientY: py, bubbles: true, cancelable: true, view: window, button: 0, ...extra }));
    const pinned = () => document.documentElement.hasAttribute("data-sc-pinned");
    const flash = () => { const d = dot.current; if (!d) return; d.classList.add("hand-dot--click"); setTimeout(() => d.classList.remove("hand-dot--click"), 160); };
    const key = (k: string) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    const click = (sel: string) => { const el = document.querySelector<HTMLElement>(sel); if (el) { el.click(); return true; } return false; };
    try {
      const h = await startHand(video.current!, {
        move(x, y) {
          px = x * innerWidth; py = y * innerHeight;
          if (dot.current) { dot.current.style.transform = `translate(${px}px, ${py}px)`; dot.current.style.opacity = "1"; }
          const el = target();
          if (el !== under) {                                   // hover in / out (BMO, menu blips, cursor states)
            if (under) { ptr("pointerout", under, { relatedTarget: el }); }
            if (el) { ptr("pointerover", el, { relatedTarget: under }); }
            under = el;
          }
          ptr("pointermove", el, { buttons: downAt ? 1 : 0 });
        },
        pinchStart() {                                           // 🤏 pinch = the left button held (grab / drag)
          downAt = { x: px, y: py }; down = target();
          dot.current?.classList.add("hand-dot--down");
          ptr("pointerdown", down, { buttons: 1 }); mouse("mousedown", down, { buttons: 1 });
        },
        pinchEnd() {                                             // let go: never a click
          dot.current?.classList.remove("hand-dot--down");
          if (downAt) { const el = target() ?? down; ptr("pointerup", el, { buttons: 0 }); mouse("mouseup", el); }
          downAt = null; down = null;
        },
        peace(x, y) {                                            // ✌ peace sign = a left click where it started
          if (downAt) return;
          const cx = x * innerWidth, cy = y * innerHeight, el = document.elementFromPoint(cx, cy), at = { clientX: cx, clientY: cy };
          ptr("pointerdown", el, { ...at, buttons: 1 }); mouse("mousedown", el, { ...at, buttons: 1 });
          ptr("pointerup", el, { ...at, buttons: 0 }); mouse("mouseup", el, at); mouse("click", el, at);
          flash(); music.blip();
        },
        fist(offset) {
          if (offset == null || !pinned()) { stickDir = 0; return; }
          const now = performance.now();
          const dir = offset > FIST_STEP ? 1 : offset < -FIST_STEP ? -1 : 0;
          if (dir === 0) { if (Math.abs(offset) < FIST_STEP * 0.5) stickDir = 0; return; } // back to the middle: re-arm
          if (dir !== stickDir || now >= stickNext) {
            stickDir = dir; stickNext = now + FIST_REPEAT;
            key(dir > 0 ? "ArrowDown" : "ArrowUp");
          }
        },
        scroll(dy) {
          if (pinned()) return;                                  // the showcase: the fist is a joystick (above)
          const el = target();
          const ev = new WheelEvent("wheel", { clientX: px, clientY: py, deltaY: dy * innerHeight * 2.4, deltaMode: 0, bubbles: true, cancelable: true, view: window });
          (el ?? document.body).dispatchEvent(ev);
          if (!ev.defaultPrevented) window.scrollBy(0, ev.deltaY);   // pages that scroll natively
        },
        palm() {
          // close the nearest thing: the chat, the picture viewer, the project page, or leave
          // About for the project showcase
          if (click(".askk__close") || click(".pd__viewer-close") || click(".pd__close")) return;
          click(".ab__top a[href*='#work']");
        },
        lost() {
          if (dot.current) dot.current.style.opacity = "0";
          stickDir = 0;
          if (downAt) { ptr("pointerup", down, { buttons: 0 }); mouse("mouseup", down); downAt = null; down = null; }
          dot.current?.classList.remove("hand-dot--down");
        },
        frame(pts, g) {
          setGesture((prev) => (prev === g ? prev : g));
          const c = skel.current; if (!c) return;
          const x = c.getContext("2d")!; x.clearRect(0, 0, c.width, c.height);
          if (!pts) return;
          x.strokeStyle = "#ffd21f"; x.lineWidth = 2; x.fillStyle = "#4cff6a";
          for (const [a, b] of CONN) { x.beginPath(); x.moveTo(pts[a].x * c.width, pts[a].y * c.height); x.lineTo(pts[b].x * c.width, pts[b].y * c.height); x.stroke(); }
          for (const p of pts) { x.beginPath(); x.arc(p.x * c.width, p.y * c.height, 2.5, 0, 7); x.fill(); }
        },
      });
      stopRef.current = h.stop;
      document.documentElement.setAttribute("data-hand", "on");
      setOn(true); setMsg("");
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setMsg(denied ? "Camera blocked. Allow it in your browser's address bar to use Hand mode." : "Couldn't start Hand mode on this device.");
      stopRef.current?.(); stopRef.current = null;
    } finally { startingRef.current = false; }
  };

  // the window became too small (or touch): stop the camera too
  useEffect(() => { if (!show && onRef.current) turnOff(); }, [show]);
  if (!show) return null;
  return (
    <>
      <button type="button" className="hand-btn" aria-pressed={on} onClick={() => { music.blip(); if (on) turnOff(); else void turnOn(); }}>
        Hand mode {on ? "on" : "off"} <kbd className="hand-btn__key" aria-hidden="true">H</kbd>
      </button>
      {msg && <p className="hand-msg" role="status">{msg}</p>}
      <div className="hand-panel" data-on={on} aria-hidden={!on}>
        <div className="hand-panel__view">
          <video ref={video} playsInline muted />
          <canvas ref={skel} width={192} height={144} />
          {gesture && <span className="hand-panel__g hand-emoji">{ICON[gesture] ?? ""}</span>}
        </div>
        <ul className="hand-panel__legend">
          {LEGEND.map(([g, text]) => (
            <li key={g}><span className="hand-emoji" aria-hidden="true">{ICON[g]}</span>{text}</li>
          ))}
        </ul>
        <p className="hand-panel__note">Camera stays on this device: the video isn&apos;t sent or saved. Your mouse still works. H or Esc to stop.</p>
      </div>
      <div ref={dot} className="hand-dot" aria-hidden="true" />
    </>
  );
}
