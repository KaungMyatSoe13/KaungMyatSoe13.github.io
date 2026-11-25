import type { Project } from "@/content/projects";

/**
 * The sticker on each game card (the "DS game card" model by maney, CC BY 4.0). The model's
 * own label belonged to a real game, so it is painted over with our own: a white code strip,
 * a coloured panel with the project's description, and a footer with the K and the stack.
 * Laid out like a real cartridge label, but no console or publisher marks.
 *
 * The model's texture is 1024²; we draw at 2× so the description stays sharp.
 * LABEL = the sticker's rectangle in that texture (pixels), stored upside down (FLIP).
 */
export const LABEL = { x0: 304, y0: 416, x1: 626, y1: 764 };
export const TEX = 2048;

const COLORS = ["#d8342a", "#2357c4", "#1f8f58", "#e07019", "#6b3ec2", "#0f8ea8", "#c23b7a"];

function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  }
  out.push(line);
  return out;
}

/** The K mark, drawn small (a simple, bold version of the site logo). */
function kMark(g: CanvasRenderingContext2D, x: number, y: number, s: number, col: string) {
  g.save(); g.translate(x, y); g.scale(s / 100, s / 100); g.fillStyle = col;
  g.beginPath(); g.roundRect(8, 6, 30, 88, 8); g.fill();
  g.beginPath(); g.moveTo(38, 52); g.lineTo(78, 6); g.lineTo(96, 6); g.lineTo(54, 56); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(46, 50); g.lineTo(96, 94); g.lineTo(74, 94); g.lineTo(36, 60); g.closePath(); g.fill();
  g.restore();
}

/** What a label says: a project's (`projectCard`), or the landing's floating arcade games. */
export type CardText = {
  /** The code on the top strip. */
  code: string;
  /** The tag after the number, e.g. "WEB" or "FIGHTING". */
  tag: string;
  /** The big text on the coloured panel. */
  big: string;
  /** Its largest size (label units; default 58). Short titles can go bigger. */
  bigMax?: number;
  /** Cover art for the panel (then `big` is printed over it as a title, arcade-logo style). */
  art?: (g: CanvasRenderingContext2D, w: number, h: number) => void;
  /** The art already carries the title (a real cover): print nothing over it. */
  artOnly?: boolean;
  /** Small, at the bottom of the panel. */
  small: string;
  /** In the rating-style box. */
  letter: string;
  year: string;
  /** The footer line. */
  foot: string;
};

export const projectCard = (p: Project): CardText => ({
  code: `KMS-${p.slug.slice(0, 4).toUpperCase()}-${p.year}`,
  tag: p.type.toUpperCase(), big: p.summary, small: p.name.toUpperCase(),
  letter: p.type[0].toUpperCase(), year: p.year, foot: p.stack.join(" · ").toUpperCase(),
});

/**
 * Paint `base` (the model's original texture) at TEX size with label `p` on it.
 * `flipX` / `flipY` say how the label area is stored in the texture.
 */
export function drawCardLabel(g: CanvasRenderingContext2D, base: CanvasImageSource, p: CardText, i: number, flipX: boolean, flipY: boolean, size = TEX) {
  const k = size / 1024;                               // `size`: the canvas (smaller for small cards)
  const css = getComputedStyle(document.body);
  const sans = css.getPropertyValue("--font-sans").trim() || "sans-serif";
  const mono = css.getPropertyValue("--font-mono").trim() || "monospace";
  const dot = css.getPropertyValue("--font-dot").trim() || "monospace";
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(base, 0, 0, size, size);
  const x0 = LABEL.x0 * k, y0 = LABEL.y0 * k, w = (LABEL.x1 - LABEL.x0) * k, h = (LABEL.y1 - LABEL.y0) * k;
  // into label space (0..w, 0..h, upright)
  g.translate(x0 + (flipX ? w : 0), y0 + (flipY ? h : 0));
  g.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  g.beginPath(); g.roundRect(0, 0, w, h, 10 * k); g.clip();

  const col = COLORS[i % COLORS.length];
  const u = w / 640;                                   // label units (640 wide)
  // paper white base
  g.fillStyle = "#f4f1ea"; g.fillRect(0, 0, w, h);
  // top strip: a product code
  g.fillStyle = "#1a1a1a"; g.textBaseline = "middle";
  g.font = `600 ${26 * u}px ${mono}`;
  g.letterSpacing = `${3 * u}px`;
  const code = p.code;
  g.fillText(code, (w - g.measureText(code).width) / 2, 34 * u);
  // the coloured panel
  const py = 64 * u, ph = h - 64 * u - 120 * u;
  const grad = g.createLinearGradient(0, py, 0, py + ph);
  grad.addColorStop(0, col); grad.addColorStop(1, shade(col, -0.28));
  g.fillStyle = grad; g.fillRect(16 * u, py, w - 32 * u, ph);
  if (p.art) {
    // cover art fills the panel; the title sits on it like a game logo
    g.save();
    g.beginPath(); g.rect(16 * u, py, w - 32 * u, ph); g.clip();
    g.translate(16 * u, py);
    p.art(g, w - 32 * u, ph);
    g.restore();
    g.textBaseline = "top"; g.letterSpacing = "0px";
  }
  if (p.art && !p.artOnly) {
    g.fillStyle = "rgba(0,0,0,0.55)"; g.font = `900 ${24 * u}px ${dot}`;
    const tg = `[${String(i + 1).padStart(2, "0")}] ${p.tag}`;
    g.fillRect(28 * u, py + 14 * u, g.measureText(tg).width + 20 * u, 36 * u);
    g.fillStyle = "#fff"; g.fillText(tg, 38 * u, py + 20 * u);
    let tpx = (p.bigMax ?? 58) * u, tl: string[] = [];
    for (; tpx >= 30 * u; tpx -= 2 * u) {
      g.font = `900 ${tpx}px ${sans}`;
      tl = wrap(g, p.big.toUpperCase(), w - 80 * u);
      if (tl.length <= 2 && tl.length * tpx * 1.0 <= ph * 0.42) break;
    }
    g.lineJoin = "round";
    tl.forEach((l, k2) => {
      const ty = py + 60 * u + k2 * tpx * 0.98, tx = (w - g.measureText(l).width) / 2;
      g.fillStyle = "#000"; g.fillText(l, tx + 5 * u, ty + 6 * u);          // drop shadow
      g.strokeStyle = "#140a1e"; g.lineWidth = 10 * u; g.strokeText(l, tx, ty);
      const lg = g.createLinearGradient(0, ty, 0, ty + tpx);
      lg.addColorStop(0, "#fff7a8"); lg.addColorStop(0.5, "#ffd21f"); lg.addColorStop(1, "#ff7a1a");
      g.fillStyle = lg; g.fillText(l, tx, ty);
    });
    g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(16 * u, py + ph - 52 * u, w - 32 * u, 52 * u);
    g.fillStyle = "#fff"; g.font = `700 ${22 * u}px ${mono}`; g.letterSpacing = `${3 * u}px`;
    if (p.small) g.fillText(p.small, 40 * u, py + ph - 40 * u);
  } else if (!p.art) {
    // halftone dots in the corner, like printed packaging art
    g.fillStyle = "rgba(255,255,255,0.13)";
    for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 9; xx++) {
      const r = (9 - Math.max(xx, yy)) * 1.6 * u;
      g.beginPath(); g.arc(w - 40 * u - xx * 26 * u, py + 24 * u + yy * 26 * u, r, 0, Math.PI * 2); g.fill();
    }
    // number + type, then the description big
    g.fillStyle = "#fff"; g.textBaseline = "top";
    g.letterSpacing = "0px";
    g.font = `900 ${30 * u}px ${dot}`;
    g.fillText(`[${String(i + 1).padStart(2, "0")}] ${p.tag}`, 40 * u, py + 26 * u);
    let px = (p.bigMax ?? 58) * u, lines: string[] = [];
    for (; px >= 30 * u; px -= 2 * u) {
      g.font = `800 ${px}px ${sans}`;
      lines = wrap(g, p.big, w - 90 * u);
      if (lines.length * px * 1.08 <= ph - 150 * u) break;
    }
    g.shadowColor = "rgba(0,0,0,0.25)"; g.shadowOffsetY = 3 * u;
    lines.forEach((l, k2) => g.fillText(l, 40 * u, py + 86 * u + k2 * px * 1.08));
    g.shadowColor = "transparent";
    // name, small, at the bottom of the panel
    g.font = `700 ${24 * u}px ${mono}`;
    g.letterSpacing = `${2 * u}px`;
    g.globalAlpha = 0.85;
    g.fillText(p.small, 40 * u, py + ph - 50 * u);
    g.globalAlpha = 1;
  }
  // footer: rating-style box, the K, the stack
  const fy = h - 112 * u;
  g.fillStyle = "#111"; g.fillRect(24 * u, fy + 14 * u, 64 * u, 82 * u);
  g.fillStyle = "#fff"; g.fillRect(29 * u, fy + 19 * u, 54 * u, 56 * u);
  g.fillStyle = "#111"; g.font = `900 ${44 * u}px ${sans}`; g.letterSpacing = "0px";
  g.fillText(p.letter, 40 * u, fy + 25 * u);
  g.fillStyle = "#fff"; g.font = `700 ${11 * u}px ${mono}`;
  g.fillText(p.year, 36 * u, fy + 79 * u);
  kMark(g, w - 120 * u, fy + 16 * u, 44 * u, "#111");
  g.fillStyle = "#111"; g.font = `900 ${30 * u}px ${dot}`;
  g.fillText("KFOLIO", w - 120 * u - g.measureText("KFOLIO").width - 10 * u, fy + 26 * u);
  g.font = `600 ${17 * u}px ${mono}`; g.letterSpacing = `${1 * u}px`;
  const stack = p.foot;
  g.fillText(stack.length > 34 ? stack.slice(0, 33) + "…" : stack, 104 * u, fy + 70 * u);
  // printed, a little worn: grain and a soft sheen
  g.globalCompositeOperation = "overlay";
  for (let q = 0; q < 1400; q++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
    g.fillRect(Math.random() * w, Math.random() * h, 2 * u, 2 * u);
  }
  g.globalCompositeOperation = "source-over";
  const sheen = g.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, "rgba(255,255,255,0.18)"); sheen.addColorStop(0.35, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(0,0,0,0.08)");
  g.fillStyle = sheen; g.fillRect(0, 0, w, h);
  g.restore();
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
