/**
 * Hand tracking for "Hand mode" (HandMode.tsx). MediaPipe Tasks Vision's HandLandmarker runs in the
 * visitor's browser (wasm + a ~8 MB model, self-hosted in public/mediapipe/); the camera video is
 * never sent anywhere or stored. It is loaded only when Hand mode is switched on.
 *
 * Turns the 21 hand points into a few simple events: a smoothed pointer (index fingertip,
 * mirrored), pinch down / up (thumb + index, with hysteresis), a fist moving up / down (scroll),
 * a peace sign (click), and an open palm held still. Thresholds come from the
 * throwaway test page (hand-test) and are normalised by the hand's own size, so they work near
 * or far from the camera.
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type HandEvents = {
  /** The pointer, 0..1 across the screen (already mirrored and mapped from the camera's middle). */
  move(x: number, y: number): void;
  pinchStart(x: number, y: number): void;
  pinchEnd(x: number, y: number): void;
  /** A fist moved vertically: dy in screen heights (positive = down). */
  scroll(dy: number): void;
  /** A fist held like a joystick: how far it is from where it was made (screen heights,
   *  positive = down), measured on the middle knuckle; null when the fist opens. */
  fist(offset: number | null): void;
  /** A peace sign (index + middle up, ring + little finger folded) held ~0.15 s: one click,
   *  at the pointer where the sign started (0..1 like move). Again only after the sign ends. */
  peace(x: number, y: number): void;
  /** An open palm held still for ~0.8 s. */
  palm(): void;
  /** The hand left the picture (release everything). */
  lost(): void;
  /** Every frame: the landmarks (mirrored x) and the recognised gesture, for the preview. */
  frame(points: NormalizedLandmark[] | null, gesture: string): void;
};

const PINCH_ON = 0.30, PINCH_OFF = 0.45;        // thumb–index distance ÷ hand size
const PALM_MS = 800, SMOOTH = 0.35;
const FIST_SETTLE_MS = 150;                      // the fist joystick's centre is taken after this
const PEACE_MS = 150;                            // a peace sign held this long = a click
const d2 = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y);

export async function startHand(video: HTMLVideoElement, ev: HandEvents): Promise<{ stop(): void }> {
  const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
  const fs = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const make = (delegate: "GPU" | "CPU") =>
    HandLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate }, runningMode: "VIDEO", numHands: 1 });
  let lm;
  try { lm = await make("GPU"); } catch { lm = await make("CPU"); }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
  video.srcObject = stream;
  await video.play();

  let alive = true, raf = 0, lastT = -1;
  let pinching = false, sx = 0.5, sy = 0.5, init = false, seen = false;
  let prev: { x: number; t: number } | null = null, lastFistY: number | null = null;
  let palmSince = 0, palmDone = false;
  // fist joystick: the anchor is set once the fist has settled (curling the fingers moves the hand)
  let fistSince = 0, fistAnchor: number | null = null, knuckleY = 0;
  let peaceSince = 0, peaceDone = false, peaceX = 0, peaceY = 0;
  let mx = 0.5, my = 0.5;                                    // the cursor (0..1), as last moved

  const loop = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden || video.currentTime === lastT) return;
    lastT = video.currentTime;
    const res = lm.detectForVideo(video, now);
    const h = res.landmarks[0];
    if (!h) {
      if (seen) { seen = false; pinching = false; peaceSince = 0; peaceDone = false; prev = null; lastFistY = null; palmSince = 0; if (fistSince) { fistSince = 0; fistAnchor = null; ev.fist(null); } ev.lost(); }
      ev.frame(null, "");
      return;
    }
    seen = true;
    const size = d2(h[0], h[9]) || 0.1;                                     // wrist → middle knuckle
    const pinchD = d2(h[4], h[8]) / size;
    const folded = [[8, 5], [12, 9], [16, 13], [20, 17]].map(([t, k]) => d2(h[t], h[0]) < d2(h[k], h[0]) * 1.05);
    const nFolded = folded.filter(Boolean).length;
    const fist = nFolded >= 4, open = nFolded === 0;
    const peace = !folded[0] && !folded[1] && folded[2] && folded[3] && !pinching && pinchD > PINCH_OFF;
    const gesture = fist ? "fist" : open ? "open" : peace ? "peace" : pinching || pinchD < PINCH_ON ? "pinch" : "point";

    // pointer: the index tip; near a pinch, the thumb–index midpoint (the tip drifts as you pinch)
    const w = Math.min(1, Math.max(0, (0.9 - pinchD) / 0.6));
    const tx = 1 - (h[8].x * (1 - w) + (h[8].x + h[4].x) / 2 * w);
    const ty = h[8].y * (1 - w) + (h[8].y + h[4].y) / 2 * w;
    if (!init) { sx = tx; sy = ty; init = true; } else { sx += (tx - sx) * SMOOTH; sy += (ty - sy) * SMOOTH; }
    // the middle of the camera view covers the whole screen: small movements reach the edges
    // the cursor moves only while pointing ☝ or pinching 🤏 (dragging); other signs leave it put
    if (gesture === "point" || gesture === "pinch") {
      mx = Math.min(1, Math.max(0, (sx - 0.15) / 0.7)); my = Math.min(1, Math.max(0, (sy - 0.1) / 0.6));
      ev.move(mx, my);
    }

    if (!pinching && pinchD < PINCH_ON && !fist) { pinching = true; ev.pinchStart(mx, my); }
    else if (pinching && pinchD > PINCH_OFF) { pinching = false; ev.pinchEnd(mx, my); }

    // ✌ peace sign = one click where it started
    if (peace) {
      if (!peaceSince) { peaceSince = now; peaceX = mx; peaceY = my; }
      if (!peaceDone && now - peaceSince > PEACE_MS) { peaceDone = true; ev.peace(peaceX, peaceY); }
    } else { peaceSince = 0; peaceDone = false; }

    // wrist speed: an open palm only counts when held still
    const cx = 1 - h[0].x;
    if (prev) {
      const dt = Math.max(0.001, (now - prev.t) / 1000), vx = (cx - prev.x) / dt / size;
      // an open palm held still
      if (open && Math.abs(vx) < 1.5) { palmSince ||= now; if (!palmDone && now - palmSince > PALM_MS) { palmDone = true; ev.palm(); } }
      else { palmSince = 0; if (!open) palmDone = false; }
    }
    prev = { x: cx, t: now };
    // a fist moving up / down scrolls
    if (fist) { if (lastFistY != null) ev.scroll((sy - lastFistY) / 0.6); lastFistY = sy; } else lastFistY = null;
    // … and as a joystick (the home card wheel): offset from where the fist settled
    if (fist) {
      knuckleY = fistSince ? knuckleY + (h[9].y - knuckleY) * 0.4 : h[9].y;
      fistSince ||= now;
      if (fistAnchor == null && now - fistSince > FIST_SETTLE_MS) fistAnchor = knuckleY;
      if (fistAnchor != null) ev.fist((knuckleY - fistAnchor) / 0.6);
    } else if (fistSince) { fistSince = 0; fistAnchor = null; ev.fist(null); }
    if (!open) palmDone = false;

    ev.frame(h.map((p) => ({ ...p, x: 1 - p.x })), gesture);
  };
  raf = requestAnimationFrame(loop);

  return {
    stop() {
      alive = false; cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      lm.close();
    },
  };
}
