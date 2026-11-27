"use client";

import { useEffect, useRef } from "react";
import { loading } from "@/lib/loading";

/** How BMO feels (from the question and the answer; AskK picks it, see `feel` there). */
export type Emotion = "neutral" | "happy" | "excited" | "love" | "sad" | "confused" | "secret" | "surprised" | "sleepy";
/** What BMO is doing; the chat sets it. `until`: when the emotion fades back to neutral (ms). */
export type BmoMood = { open: boolean; hover: boolean; thinking: boolean; talking: boolean; emotion: Emotion; until: number };

/** The face screen in the model's 1024² texture (px), stored upside down (flipped vertically). */
const FACE = { x: 130, y: 484, w: 502, h: 384, r: 40 };
const SCREEN = "#cdf7d6", INK = "#0f1f1a", PINK = "rgba(255, 110, 150, 0.55)";

const heart = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.7, y - r * 1.3, x, y - r * 0.35);
  g.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.1, x, y + r * 0.9);
  g.fill();
};

/** Draw BMO's face (upright) into a w×h box. */
function drawFace(g: CanvasRenderingContext2D, w: number, h: number, t: number, m: BmoMood, blink: boolean) {
  g.fillStyle = SCREEN; g.fillRect(0, 0, w, h);
  g.fillStyle = INK; g.strokeStyle = INK; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 16;
  const cx = w / 2, ex = w * 0.26, ey = h * 0.4, my = h * 0.7;
  const L = cx - ex, R = cx + ex;
  const e: Emotion = m.thinking ? "neutral" : m.emotion !== "neutral" ? m.emotion : m.hover || m.open ? "happy" : "neutral";
  const dot = (x: number, y: number, rx = 15, ry = 24) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  const line = (pts: number[]) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
  const arc = (x: number, y: number, r: number, a0: number, a1: number) => { g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); };
  const cheeks = () => { g.fillStyle = PINK; dot(L - 34, ey + 52, 30, 16); dot(R + 34, ey + 52, 30, 16); g.fillStyle = INK; };

  // ---- eyes ----
  if (m.thinking) { dot(L + 14, ey - 18); dot(R + 14, ey - 18); }                      // looking up, thinking
  else if (blink && e !== "love" && e !== "secret" && e !== "sleepy") { line([L - 18, ey, L + 18, ey]); line([R - 18, ey, R + 18, ey]); }
  else switch (e) {
    case "happy": line([L - 20, ey + 10, L, ey - 12, L + 20, ey + 10]); line([R - 20, ey + 10, R, ey - 12, R + 20, ey + 10]); break;
    case "excited": {
      dot(L, ey, 24, 30); dot(R, ey, 24, 30);
      g.fillStyle = SCREEN; dot(L + 8, ey - 10, 7, 7); dot(R + 8, ey - 10, 7, 7); g.fillStyle = INK;   // sparkle
      break;
    }
    case "love": { g.fillStyle = "#e8305a"; const p = 1 + Math.sin(t * 8) * 0.08; heart(g, L, ey, 26 * p); heart(g, R, ey, 26 * p); g.fillStyle = INK; break; }
    case "sad": line([L - 22, ey - 10, L + 18, ey + 4]); line([R - 18, ey + 4, R + 22, ey - 10]); dot(L, ey + 16, 11, 15); dot(R, ey + 16, 11, 15); break;
    case "confused": dot(L, ey, 13, 18); dot(R, ey - 4, 22, 30); line([R - 24, ey - 52, R + 22, ey - 44]); break;
    case "secret": line([L - 20, ey, L + 20, ey]); dot(R, ey); break;                            // a wink
    case "surprised": g.lineWidth = 12; arc(L, ey, 22, 0, Math.PI * 2); arc(R, ey, 22, 0, Math.PI * 2); dot(L, ey, 7, 7); dot(R, ey, 7, 7); g.lineWidth = 16; break;
    case "sleepy": line([L - 20, ey + 4, L + 20, ey + 4]); line([R - 20, ey + 4, R + 20, ey + 4]); break;
    default: dot(L, ey); dot(R, ey);
  }

  // ---- extras ----
  if (e === "love" || e === "happy" && (m.hover || m.open)) cheeks();
  if (e === "excited" && !m.thinking) cheeks();
  if (e === "sad" && !m.thinking) {                                                              // a tear
    const ty = ey + 40 + ((t * 60) % 60);
    g.fillStyle = "#3aa0ff"; g.globalAlpha = 1 - ((t * 60) % 60) / 60;
    g.beginPath(); g.moveTo(R + 14, ty - 14); g.quadraticCurveTo(R + 24, ty + 2, R + 14, ty + 6); g.quadraticCurveTo(R + 4, ty + 2, R + 14, ty - 14); g.fill();
    g.globalAlpha = 1; g.fillStyle = INK;
  }
  if (e === "confused" && !m.thinking) { g.font = "900 64px monospace"; g.fillText("?", w - 70, 70); }
  if (e === "sleepy" && !m.thinking) { g.font = "900 40px monospace"; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2); g.fillText("z", w - 90, 70); g.fillText("Z", w - 60, 40); g.globalAlpha = 1; }

  // ---- mouth ----
  if (m.talking) {
    const o = 10 + Math.abs(Math.sin(t * 17)) * 34;                                             // chattering
    if (e === "sad") { g.beginPath(); g.ellipse(cx, my + 6, 26, o / 3 + 4, 0, 0, Math.PI * 2); g.fill(); }
    else { g.beginPath(); g.ellipse(cx, my, 34, o / 2 + 4, 0, 0, Math.PI * 2); g.fill(); }
  } else if (m.thinking) {
    for (let k = 0; k < 3; k++) {
      g.globalAlpha = Math.floor(t * 3) % 4 > k ? 1 : 0.25; g.beginPath(); g.arc(cx - 40 + k * 40, my, 10, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  } else switch (e) {
    case "happy": case "love": g.beginPath(); g.moveTo(cx - 60, my - 16); g.quadraticCurveTo(cx, my + 62, cx + 60, my - 16); g.closePath(); g.fill(); break;
    case "excited": {
      g.beginPath(); g.moveTo(cx - 64, my - 22); g.quadraticCurveTo(cx, my + 74, cx + 64, my - 22); g.closePath(); g.fill();
      g.fillStyle = "#ff6f8a"; g.beginPath(); g.ellipse(cx, my + 18, 22, 11, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = INK;  // tongue
      break;
    }
    case "sad": g.beginPath(); g.moveTo(cx - 44, my + 18); g.quadraticCurveTo(cx, my - 22, cx + 44, my + 18); g.stroke(); break;
    case "confused": { g.beginPath(); g.moveTo(cx - 50, my); for (let k = 1; k <= 4; k++) g.lineTo(cx - 50 + k * 25, my + (k % 2 ? -12 : 12)); g.stroke(); break; }
    case "secret": {                                                                             // lips zipped
      line([cx - 56, my, cx + 56, my]);
      g.lineWidth = 6; for (let k = -2; k <= 2; k++) line([cx + k * 22, my - 12, cx + k * 22, my + 12]); g.lineWidth = 16;
      break;
    }
    case "surprised": g.beginPath(); g.ellipse(cx, my + 4, 22, 28, 0, 0, Math.PI * 2); g.fill(); break;
    case "sleepy": g.beginPath(); g.ellipse(cx, my, 16, 10 + Math.abs(Math.sin(t)) * 8, 0, 0, Math.PI * 2); g.fill(); break;
    default: g.beginPath(); g.moveTo(cx - 46, my - 6); g.quadraticCurveTo(cx, my + 34, cx + 46, my - 6); g.stroke();
  }
}

/**
 * The chat's mascot: BMO ("BMO" by linus1178, Sketchfab, CC BY 4.0, credited on About), floating
 * in its own spot, turning a little toward the pointer. Its face is painted into the model's
 * texture each frame: blinks, "..." while thinking, chatters while the answer streams in, and
 * shows an emotion that fits the question and the answer (happy, excited, love, sad, confused,
 * secret, surprised; dozes off when nobody is around). Loads after the first-load counter.
 */
export default function Bmo({ mood }: { mood: React.RefObject<BmoMood> }) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = host.current!;
    let stop = () => {}, alive = true;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = window.setInterval(() => {
      if (!loading.isFinished() && document.querySelector(".loader")) return;
      window.clearInterval(wait);
      void start();
    }, 250);

    async function start() {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const gltf = await new GLTFLoader().loadAsync("/ui/bmo.glb");
      if (!alive) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-2, 3, 4); scene.add(key);
      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

      // centred, 2 units tall, facing +z
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const s = 2 / size.y;
      model.scale.setScalar(s); model.position.copy(mid.multiplyScalar(-s));
      const rig = new THREE.Group(); rig.add(model); scene.add(rig);
      camera.position.set(0, 0.15, 6.4); camera.lookAt(0, 0, 0);

      // the texture becomes a canvas; only the face box is repainted
      let tex: import("three").CanvasTexture | null = null, g: CanvasRenderingContext2D | null = null;
      const face = document.createElement("canvas"); face.width = FACE.w; face.height = FACE.h;
      const fg = face.getContext("2d")!;
      model.traverse((o) => {
        const m = o as import("three").Mesh;
        const mat = m.isMesh ? (m.material as import("three").MeshStandardMaterial) : null;
        if (!mat?.map?.image || tex) return;
        const img = mat.map.image as CanvasImageSource & { width: number; height: number };
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        g = c.getContext("2d")!; g.drawImage(img, 0, 0);
        tex = new THREE.CanvasTexture(c);
        tex.flipY = mat.map.flipY; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        mat.map = tex; mat.needsUpdate = true;
      });
      const k = (g as CanvasRenderingContext2D | null)?.canvas.width ? (g as unknown as CanvasRenderingContext2D).canvas.width / 1024 : 1;

      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
      };
      fit();
      const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
      let lastActive = performance.now();
      const onMove = (e: PointerEvent) => {
        ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = -((e.clientY / innerHeight) * 2 - 1);
        lastActive = performance.now();
        if (mood.current.emotion === "sleepy") { mood.current.emotion = "surprised"; mood.current.until = lastActive + 1200; }   // woke up!
      };
      addEventListener("pointermove", onMove, { passive: true });

      let raf = 0, last = 0, nextBlink = 2000, blinkUntil = 0;
      const t0 = performance.now();
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const t = (now - t0) / 1000, m = mood.current;
        if (m.emotion !== "neutral" && now > m.until && !m.talking) m.emotion = "neutral";
        // nobody around for a minute: BMO dozes off (wakes on the pointer)
        if (now - lastActive > 60000 && !m.open && m.emotion === "neutral") { m.emotion = "sleepy"; m.until = Infinity; }
        // floats in place; leans toward the pointer; hops a little while talking
        ptr.sx += (ptr.x - ptr.sx) * 0.06; ptr.sy += (ptr.y - ptr.sy) * 0.06;
        const hop = m.talking && !reduced ? Math.abs(Math.sin(t * 9)) * 0.06 : 0;
        rig.position.y = (reduced ? 0 : Math.sin(t * 1.4) * 0.06) + hop;
        rig.rotation.y = reduced ? 0 : 0.35 * ptr.sx + Math.sin(t * 0.5) * 0.12;
        rig.rotation.x = reduced ? 0 : -0.15 * ptr.sy;
        // body language: tilts while thinking or confused, bounces when excited, droops when sad
        const ex = !reduced && m.emotion === "excited" ? Math.abs(Math.sin(t * 7)) * 0.08 : 0;
        rig.position.y += ex - (m.emotion === "sad" ? 0.06 : 0) - (m.emotion === "sleepy" ? 0.04 : 0);
        rig.rotation.z = reduced ? 0 : Math.sin(t * 0.9) * 0.05 + (m.thinking ? 0.12 : 0) + (m.emotion === "confused" ? -0.18 : 0);
        if (m.emotion === "secret" && !reduced) rig.rotation.y += Math.sin(t * 3) * 0.15;
        if (m.emotion === "surprised" && !reduced) rig.position.y += 0.08;
        // the face, ~15 fps
        if (g && tex && now - last > 66) {
          last = now;
          if (now > nextBlink) { blinkUntil = now + 140; nextBlink = now + 2200 + Math.random() * 3000; }
          drawFace(fg, FACE.w, FACE.h, t, m, now < blinkUntil);
          const c = g as CanvasRenderingContext2D;
          c.save();
          c.beginPath(); c.roundRect(FACE.x * k, FACE.y * k, FACE.w * k, FACE.h * k, FACE.r * k); c.clip();
          c.translate(FACE.x * k, (FACE.y + FACE.h) * k); c.scale(k, -k);       // stored upside down
          c.drawImage(face, 0, 0);
          c.restore();
          (tex as import("three").CanvasTexture).needsUpdate = true;
        }
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);
      stop = () => { cancelAnimationFrame(raf); removeEventListener("pointermove", onMove); renderer.dispose(); renderer.domElement.remove(); };
    }
    return () => { alive = false; window.clearInterval(wait); stop(); };
  }, [mood]);
  return <span ref={host} className="askk-btn__bmo" aria-hidden="true" />;
}
