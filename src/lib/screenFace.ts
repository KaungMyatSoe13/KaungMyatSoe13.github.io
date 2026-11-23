import { pixelKCells } from "./pixelK";
import type { Project } from "@/content/projects";

/**
 * What the home page arcade's screen shows: an attract screen with the project's name.
 * The project page draws the same picture on its middle screen while it opens, so the
 * screen that leaves the arcade is the same one.
 *
 * `glitch` (0..1) breaks the picture into jumping slices and static, for project changes.
 */
export const SCREEN_BG = "#07061a";

function fitName(g: CanvasRenderingContext2D, name: string, max: number, font: (px: number) => string, start: number, min: number) {
  for (let px = start; px >= min; px -= 2) {
    g.font = font(px);
    const lines: string[] = [];
    let line = "";
    for (const w of name.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t;
    }
    lines.push(line);
    if (lines.length <= 2 && lines.every((l) => g.measureText(l).width <= max)) return { px, lines };
  }
  return { px: min, lines: [name] };
}

export function drawScreenFace(
  g: CanvasRenderingContext2D, p: Project, i: number, n: number,
  { t = 0, glitch = 0, prompt = true }: { t?: number; glitch?: number; prompt?: boolean } = {},
) {
  const W = g.canvas.width, H = g.canvas.height, u = W / 1024;
  const css = getComputedStyle(document.body);
  const dot = css.getPropertyValue("--font-dot").trim() || "monospace";
  const mono = css.getPropertyValue("--font-mono").trim() || "monospace";
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.letterSpacing = "0px";
  // night sky: dark blue to violet, a perspective grid floor, a few stars
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, SCREEN_BG); sky.addColorStop(0.62, "#1d0f3d"); sky.addColorStop(1, "#3a0d3a");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.7)";
  for (let k = 0; k < 40; k++) {
    const x = ((k * 389) % 1000) / 1000 * W, y = ((k * 211) % 520) / 1000 * H;
    const on = Math.sin(t * 2 + k) > -0.6 ? 1 : 0.3;
    g.globalAlpha = on * (0.4 + (k % 3) * 0.2);
    g.fillRect(x, y, 3 * u, 3 * u);
  }
  g.globalAlpha = 1;
  const hz = H * 0.64;
  g.strokeStyle = "rgba(255, 70, 190, 0.55)"; g.lineWidth = 2 * u;
  for (let k = -12; k <= 12; k++) { g.beginPath(); g.moveTo(W / 2 + k * 40 * u, hz); g.lineTo(W / 2 + k * 260 * u, H); g.stroke(); }
  const scroll = (t * 0.6) % 1;
  for (let k = 0; k < 9; k++) {
    const f = (k + scroll) / 9, y = hz + (H - hz) * f * f;
    g.globalAlpha = 0.2 + f * 0.7;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  g.globalAlpha = 1;

  // top bar, like a score line
  g.textBaseline = "top";
  g.font = `900 ${30 * u}px ${dot}`;
  g.fillStyle = "#ff3b3b";
  g.fillText("1UP", 70 * u, 54 * u);
  g.fillStyle = "#ffffff";
  const no = `${String(i + 1).padStart(2, "0")}/${String(n).padStart(2, "0")}`;
  g.fillText(no, (W - g.measureText(no).width) / 2, 54 * u);
  g.fillStyle = "#ffd23b";
  const meta = `${p.type} ${p.year}`.toUpperCase();
  g.fillText(meta, W - 70 * u - g.measureText(meta).width, 54 * u);

  // the name: chunky dot-matrix with a hard drop shadow and a glow
  const pad = 70 * u;
  const { px, lines } = fitName(g, p.name.toUpperCase(), W - pad * 2, (s) => `900 ${s * u}px ${dot}`, 132, 56);
  g.font = `900 ${px * u}px ${dot}`;
  const lh = px * u * 1.0, top = H * 0.4 - (lines.length * lh) / 2;
  lines.forEach((l, k) => {
    const x = (W - g.measureText(l).width) / 2, y = top + k * lh;
    g.fillStyle = "#c2185b"; g.fillText(l, x + 8 * u, y + 8 * u);
    g.shadowColor = "rgba(255, 230, 120, 0.8)"; g.shadowBlur = 22 * u;
    const fill = g.createLinearGradient(0, y, 0, y + lh);
    fill.addColorStop(0, "#fff6b0"); fill.addColorStop(1, "#ffb21e");
    g.fillStyle = fill; g.fillText(l, x, y);
    g.shadowBlur = 0;
  });

  if (prompt && Math.floor(t * 1.6) % 2 === 0) {
    g.font = `900 ${32 * u}px ${dot}`;
    g.fillStyle = "#ffffff";
    const txt = "PRESS START";
    g.fillText(txt, (W - g.measureText(txt).width) / 2, H * 0.74);
  }
  g.font = `500 ${18 * u}px ${mono}`;
  g.fillStyle = "rgba(255,255,255,0.55)";
  const c = "© KFOLIO";
  g.fillText(c, (W - g.measureText(c).width) / 2, H - 56 * u);

  // scanlines
  g.fillStyle = "rgba(0, 0, 0, 0.28)";
  for (let y = 0; y < H; y += 4 * u) g.fillRect(0, y, W, 2 * u);

  // project change: slices jump, static and a bright roll
  if (glitch > 0.001) {
    for (let k = 0; k < 10; k++) {
      const y = Math.random() * H, h = (6 + Math.random() * 60) * u, dx = (Math.random() - 0.5) * 220 * u * glitch;
      g.drawImage(g.canvas, 0, y, W, h, dx, y, W, h);
    }
    const n2 = Math.floor(2600 * glitch);
    for (let k = 0; k < n2; k++) {
      const v = 120 + Math.random() * 135;
      g.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.5})`;
      g.fillRect(Math.random() * W, Math.random() * H, (1 + Math.random() * 3) * u, (1 + Math.random() * 2) * u);
    }
    g.fillStyle = `rgba(255, 255, 255, ${0.12 * glitch})`;
    g.fillRect(0, ((t * 900) % (H + 200)) - 100, W, 70 * u);
  }
  g.restore();
}

/** The landing: the pixel K (the favicon's) on the arcade screen, "INSERT COIN" under it. */
export function drawKFace(g: CanvasRenderingContext2D, { t = 0, glitch = 0 } = {}) {
  const W = g.canvas.width, H = g.canvas.height, u = W / 1024;
  const css = getComputedStyle(document.body);
  const dot = css.getPropertyValue("--font-dot").trim() || "monospace";
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.letterSpacing = "0px";
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, SCREEN_BG); sky.addColorStop(0.62, "#1d0f3d"); sky.addColorStop(1, "#3a0d3a");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // the K in big arcade pixels: black outline + drop shadow, yellow blocks with a glow
  const K = pixelKCells(), cs = Math.round(30 * u);
  const kx = Math.round((W - K.w * cs) / 2), ky = Math.round(H * 0.42 - (K.h * cs) / 2 + Math.round(Math.sin(t * 2) * 2) * 3 * u);
  g.fillStyle = "#000";
  for (const [x, y] of K.ink) g.fillRect(kx + (x - 1) * cs, ky + (y - 1) * cs, cs, cs);
  g.shadowColor = "rgba(255, 220, 80, 0.75)"; g.shadowBlur = 26 * u;
  g.fillStyle = "#ffd21f";
  for (const [x, y] of K.fill) g.fillRect(kx + (x - 1) * cs, ky + (y - 1) * cs, cs, cs);
  g.shadowBlur = 0;
  g.fillStyle = "rgba(255, 255, 255, 0.35)";                   // a pixel highlight on each block's top
  for (const [x, y] of K.fill) g.fillRect(kx + (x - 1) * cs, ky + (y - 1) * cs, cs, Math.max(2, cs * 0.2));
  if (Math.floor(t * 1.6) % 2 === 0) {
    g.font = `900 ${34 * u}px ${dot}`; g.fillStyle = "#ffffff"; g.textBaseline = "top";
    const txt = "INSERT COIN";
    g.fillText(txt, (W - g.measureText(txt).width) / 2, H * 0.78);
  }
  g.fillStyle = "rgba(0, 0, 0, 0.28)";
  for (let y = 0; y < H; y += 4 * u) g.fillRect(0, y, W, 2 * u);
  if (glitch > 0.001) {
    for (let q = 0; q < 10; q++) {
      const y = Math.random() * H, h = (6 + Math.random() * 60) * u, dx = (Math.random() - 0.5) * 220 * u * glitch;
      g.drawImage(g.canvas, 0, y, W, h, dx, y, W, h);
    }
    for (let q = 0; q < 2600 * glitch; q++) {
      const v = 120 + Math.random() * 135;
      g.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.5})`;
      g.fillRect(Math.random() * W, Math.random() * H, (1 + Math.random() * 3) * u, (1 + Math.random() * 2) * u);
    }
  }
  g.restore();
}
