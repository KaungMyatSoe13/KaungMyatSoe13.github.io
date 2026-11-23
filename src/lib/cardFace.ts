import type { Project } from "@/content/projects";
import { CARD_W } from "./cardGrid";

/**
 * The project cards on the home showcase: the kraft-paper card from the "Squid Game Card"
 * model (Ahadun, Sketchfab, CC BY 4.0; credited on the page), with the project's brief
 * printed on it in ink. No screenshots. The paper (`card-paper.webp`) is the model's own
 * texture, lit with its normal map; the ○△□ mark (`card-mark.webp`) is its printed symbol.
 * The project page draws the same face so the opening card can fade into the pictures.
 */
export const CARD_FACE = { paper: "/showcase/card-paper.webp", mark: "/showcase/card-mark.webp" };
export const CARD_CREDIT = { author: "Ahadun", url: "https://sketchfab.com/Ahadun" };

type Assets = { paper: HTMLImageElement; mark: HTMLImageElement };
let assets: Promise<Assets> | null = null;
export function loadCardFace() {
  assets ??= (async () => {
    const load = (src: string) => { const im = new Image(); im.src = src; return im.decode().then(() => im); };
    const [paper, mark] = await Promise.all([load(CARD_FACE.paper), load(CARD_FACE.mark)]);
    await (document.fonts?.ready ?? Promise.resolve());
    return { paper, mark };
  })();
  return assets;
}

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

/** Draw project `p` (number `i` of `n`) as a printed card filling `g`'s canvas. */
export function drawCardFace(g: CanvasRenderingContext2D, a: Assets, p: Project, i: number, n: number) {
  const W = g.canvas.width, H = g.canvas.height, u = W / 1024;
  const css = getComputedStyle(document.body);
  const sans = css.getPropertyValue("--font-sans").trim() || "sans-serif";
  const mono = css.getPropertyValue("--font-mono").trim() || "monospace";
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.drawImage(a.paper, 0, 0, W, H);

  // ink: everything printed goes on with multiply, so the paper shows through
  g.globalCompositeOperation = "multiply";
  const ink = "rgb(40, 31, 24)";
  g.fillStyle = ink;
  // On phones only the middle of the card is on screen (it is wider than the phone), so
  // the print goes in that visible strip, stacked. Elsewhere it sits in the right three
  // quarters: BMO stands in front of the card's left side, and the picture is soft there.
  const seen = (2 * innerWidth) / innerHeight / CARD_W;                  // visible share of the card
  if (seen < 0.85) { drawNarrow(g, a, p, i, n, seen, sans, mono); return; }
  const pad = 74 * u, x0 = W * 0.25, x1 = W - pad;
  const mh = 50 * u, mw = (a.mark.width / a.mark.height) * mh;
  g.drawImage(a.mark, x0, 62 * u, mw, mh);
  g.textBaseline = "top";
  g.font = `500 ${17 * u}px ${mono}`;
  g.letterSpacing = `${2 * u}px`;
  const no = `[${String(i + 1).padStart(2, "0")}] / ${String(n).padStart(2, "0")}`;
  g.fillText(no, x1 - g.measureText(no).width, 78 * u);

  // the brief, big and centred
  g.letterSpacing = "0px";
  let px = 56 * u, lines: string[] = [];
  for (; px >= 34 * u; px -= 2 * u) {
    g.font = `600 ${px}px ${sans}`;
    lines = wrap(g, p.summary, x1 - x0);
    if (lines.length <= 3) break;
  }
  const lh = px * 1.14, top = (H - lines.length * lh) / 2 + 4 * u;
  lines.forEach((l, k) => g.fillText(l, x0, top + k * lh));

  // the small print, where the real card has its number
  g.font = `500 ${15 * u}px ${mono}`;
  g.letterSpacing = `${1.5 * u}px`;
  const stack = p.stack.join(" / ").toUpperCase();
  const meta = `${p.type} · ${p.year}`.toUpperCase();
  g.fillText(stack, x0, H - 92 * u);
  g.fillText(meta, x1 - g.measureText(meta).width, H - 92 * u);
  g.globalAlpha = 0.5;
  g.fillRect(x0, H - 112 * u, x1 - x0, 1.5 * u);
  g.globalAlpha = 1;

  finish(g);
  g.restore();
}

/** The phone layout: everything in the visible middle strip of the card. */
function drawNarrow(g: CanvasRenderingContext2D, a: Assets, p: Project, i: number, n: number, seen: number, sans: string, mono: string) {
  const W = g.canvas.width, u = W / 1024;
  const x0 = W * (0.5 - seen / 2 + 0.035), x1 = W * (0.5 + seen / 2 - 0.035);
  const mh = 34 * u, mw = (a.mark.width / a.mark.height) * mh;
  g.drawImage(a.mark, x0, 70 * u, mw, mh);
  g.textBaseline = "top";
  g.font = `500 ${15 * u}px ${mono}`;
  g.letterSpacing = `${1.5 * u}px`;
  const no = `[${String(i + 1).padStart(2, "0")}] / ${String(n).padStart(2, "0")}`;
  g.fillText(no, x1 - g.measureText(no).width, 80 * u);
  g.letterSpacing = "0px";
  let px = 38 * u, lines: string[] = [];
  for (; px >= 24 * u; px -= 2 * u) {
    g.font = `600 ${px}px ${sans}`;
    lines = wrap(g, p.summary, x1 - x0);
    if (lines.length <= 6) break;
  }
  const lh = px * 1.15;
  let y = 132 * u;
  lines.forEach((l) => { g.fillText(l, x0, y); y += lh; });
  y += 14 * u;
  g.globalAlpha = 0.5; g.fillRect(x0, y, x1 - x0, 1.5 * u); g.globalAlpha = 1;
  y += 12 * u;
  g.font = `500 ${14 * u}px ${mono}`;
  g.letterSpacing = `${1.2 * u}px`;
  for (const l of wrap(g, p.stack.join(" / ").toUpperCase(), x1 - x0)) { g.fillText(l, x0, y); y += 22 * u; }
  g.fillText(`${p.type} · ${p.year}`.toUpperCase(), x0, y + 6 * u);
  finish(g);
  g.restore();
}

/** Worn print and the card's edge (its thickness). */
function finish(g: CanvasRenderingContext2D) {
  const W = g.canvas.width, H = g.canvas.height, u = W / 1024;
  // printed, not perfect: knock a little ink out of everything
  g.globalCompositeOperation = "screen";
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(200, 180, 140, ${0.05 + Math.random() * 0.12})`;
    g.fillRect(Math.random() * W, Math.random() * H, (1 + Math.random() * 2) * u, (1 + Math.random() * 2) * u);
  }

  // the card's edge: a thin darker rim and a faint highlight inside it (its thickness)
  g.globalCompositeOperation = "source-over";
  g.strokeStyle = "rgba(60, 45, 25, 0.35)"; g.lineWidth = 5 * u; g.strokeRect(0, 0, W, H);
  g.strokeStyle = "rgba(255, 245, 220, 0.18)"; g.lineWidth = 2 * u; g.strokeRect(4 * u, 4 * u, W - 8 * u, H - 8 * u);
}
