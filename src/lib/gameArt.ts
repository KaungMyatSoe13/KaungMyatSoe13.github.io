/**
 * Cover art for the landing's floating arcade-game cards: our own 90s-arcade-style scenes,
 * one per genre (the real covers belong to their publishers, so none are copied), drawn on
 * a canvas in the card label's coloured panel. `seed` varies colours and poses per card.
 */
export type Genre = "Fighting" | "Run & gun" | "Sports" | "Racing" | "Puzzle" | "Shooter" | "Rhythm" | "Driving";

const SKIES: [string, string][] = [
  ["#1a0b3d", "#ff5a36"], ["#05184a", "#ff2e88"], ["#2b0a3d", "#ffb21f"], ["#062a3a", "#29e3c8"], ["#300a0a", "#ff7b1c"],
];

function rand(seed: number) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/** A blocky figure (head, body, arms and legs), standing at (x, y = feet), facing `dir`. */
function fighter(g: CanvasRenderingContext2D, x: number, y: number, h: number, dir: 1 | -1, col: string, kick: boolean) {
  const u = h / 10;
  g.save(); g.translate(x, y); g.scale(dir, 1); g.fillStyle = col;
  g.fillRect(-1.2 * u, -10 * u, 2.4 * u, 2.4 * u);                 // head
  g.fillRect(-1.6 * u, -7.4 * u, 3.4 * u, 3.8 * u);                // body
  g.fillRect(1.6 * u, -7 * u, 3 * u, 1.2 * u);                     // front arm, punching
  g.fillRect(-3.2 * u, -6.6 * u, 1.8 * u, 1.1 * u);                // back arm
  g.fillRect(-1.6 * u, -3.8 * u, 1.4 * u, 3.8 * u);                // back leg
  if (kick) { g.save(); g.translate(0.4 * u, -3.6 * u); g.rotate(-1.1); g.fillRect(0, 0, 1.4 * u, 4.4 * u); g.restore(); }
  else g.fillRect(0.4 * u, -3.8 * u, 1.4 * u, 3.8 * u);
  g.restore();
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, n: number, col: string) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r0 : r1; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath(); g.fill();
}

function car(g: CanvasRenderingContext2D, x: number, y: number, w: number, col: string) {
  const h = w * 0.36;
  g.fillStyle = col;
  g.beginPath(); g.roundRect(x - w / 2, y - h, w, h * 0.62, h * 0.12); g.fill();
  g.beginPath(); g.moveTo(x - w * 0.3, y - h); g.lineTo(x - w * 0.18, y - h * 1.55); g.lineTo(x + w * 0.18, y - h * 1.55); g.lineTo(x + w * 0.3, y - h); g.fill();
  g.fillStyle = "rgba(170,230,255,0.85)"; g.fillRect(x - w * 0.16, y - h * 1.45, w * 0.32, h * 0.38);
  g.fillStyle = "#111"; g.fillRect(x - w * 0.46, y - h * 0.4, w * 0.18, h * 0.4); g.fillRect(x + w * 0.28, y - h * 0.4, w * 0.18, h * 0.4);
  g.fillStyle = "#ff3b2f"; g.fillRect(x - w * 0.46, y - h * 0.86, w * 0.1, h * 0.12); g.fillRect(x + w * 0.36, y - h * 0.86, w * 0.1, h * 0.12);
}

/** Paint the cover for `genre` over (0, 0, w, h). */
export function drawGameArt(g: CanvasRenderingContext2D, genre: string, w: number, h: number, seed: number) {
  const r = rand(seed + 1);
  const [top, bot] = SKIES[seed % SKIES.length];
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, top); sky.addColorStop(1, bot);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const hz = h * 0.66;                                             // horizon
  // a striped synthwave sun behind everything
  const sun = (cx: number, cy: number, rad: number) => {
    const sg = g.createLinearGradient(0, cy - rad, 0, cy + rad);
    sg.addColorStop(0, "#ffe66b"); sg.addColorStop(1, "#ff3d7f");
    g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
    g.fillStyle = bot;
    for (let k = 0; k < 6; k++) g.fillRect(cx - rad, cy + rad * (0.1 + k * 0.16), rad * 2, rad * 0.05 * (k + 1));
  };
  const grid = (col: string) => {
    g.strokeStyle = col; g.lineWidth = Math.max(1, w / 260);
    for (let k = 0; k < 9; k++) { const y = hz + (h - hz) * Math.pow(k / 8, 1.8); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let k = -8; k <= 8; k++) { g.beginPath(); g.moveTo(w / 2 + k * w * 0.04, hz); g.lineTo(w / 2 + k * w * 0.34, h); g.stroke(); }
  };
  switch (genre as Genre) {
    case "Fighting": {
      sun(w * 0.5, hz - h * 0.08, h * 0.26);
      g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, hz, w, h - hz);
      fighter(g, w * 0.27, h * 0.94, h * 0.62, 1, "#141018", r() > 0.5);
      fighter(g, w * 0.73, h * 0.94, h * 0.62, -1, "#141018", r() > 0.5);
      star(g, w * 0.5, h * 0.5, h * 0.09, h * 0.2, 9, "#fff04a");
      g.fillStyle = "#d8211b"; g.font = `900 ${h * 0.16}px Impact, "Arial Black", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("VS", w * 0.5, h * 0.51); g.textAlign = "left";
      break;
    }
    case "Racing": case "Driving": {
      sun(w * 0.5, hz, h * 0.22);
      g.fillStyle = "#1a1030"; g.fillRect(0, hz, w, h - hz);
      g.fillStyle = "#3a3a46"; g.beginPath(); g.moveTo(w * 0.47, hz); g.lineTo(w * 0.53, hz); g.lineTo(w * 0.95, h); g.lineTo(w * 0.05, h); g.fill();
      g.fillStyle = "#fff";
      for (let k = 0; k < 5; k++) { const t0 = k / 5, t1 = t0 + 0.09; const y0 = hz + (h - hz) * t0 * t0, y1 = hz + (h - hz) * t1 * t1; g.fillRect(w * 0.5 - w * 0.006 * (1 + t0 * 4), y0, w * 0.012 * (1 + t0 * 4), y1 - y0); }
      car(g, w * 0.5, h * 0.96, w * 0.42, genre === "Driving" ? "#ffd21f" : r() > 0.5 ? "#e8231b" : "#1f6fe8");
      break;
    }
    case "Shooter": {
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, 0, w, h);
      // a row of shambling silhouettes and a crosshair on one
      for (let k = 0; k < 4; k++) fighter(g, w * (0.18 + k * 0.22), h * (0.9 - (k % 2) * 0.05), h * (0.42 + (k % 2) * 0.08), k % 2 ? -1 : 1, "#0b0d10", false);
      const cx = w * (0.3 + r() * 0.4), cy = h * 0.5;
      g.strokeStyle = "#ff2a2a"; g.lineWidth = w * 0.012;
      g.beginPath(); g.arc(cx, cy, h * 0.13, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(cx - h * 0.2, cy); g.lineTo(cx + h * 0.2, cy); g.moveTo(cx, cy - h * 0.2); g.lineTo(cx, cy + h * 0.2); g.stroke();
      star(g, w * 0.86, h * 0.2, h * 0.04, h * 0.1, 7, "#ffe14d");
      break;
    }
    case "Run & gun": {
      g.fillStyle = "#c98a3a"; g.fillRect(0, hz, w, h - hz);
      for (let k = 0; k < 3; k++) {
        const x = w * (0.25 + k * 0.28 + (r() - 0.5) * 0.1), y = hz - h * (0.05 + r() * 0.2), rad = h * (0.12 + r() * 0.08);
        g.fillStyle = "#ff6a1f"; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#ffd94a"; g.beginPath(); g.arc(x, y, rad * 0.6, 0, Math.PI * 2); g.fill();
      }
      fighter(g, w * 0.32, h * 0.95, h * 0.55, 1, "#1c2414", false);
      g.fillStyle = "#1c2414"; g.fillRect(w * 0.36, h * 0.6, w * 0.2, h * 0.04);       // the gun
      for (let k = 0; k < 4; k++) { g.fillStyle = "#fff36b"; g.fillRect(w * (0.6 + k * 0.08), h * 0.605, w * 0.04, h * 0.02); }
      break;
    }
    case "Sports": {
      g.fillStyle = "#c46a2a"; g.beginPath(); g.moveTo(0, hz); g.lineTo(w, hz); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = w * 0.008;
      g.beginPath(); g.ellipse(w * 0.5, h * 0.88, w * 0.3, h * 0.08, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "#fff"; g.fillRect(w * 0.68, h * 0.12, w * 0.24, h * 0.18);                  // backboard
      g.strokeStyle = "#ff4b1f"; g.lineWidth = w * 0.014; g.strokeRect(w * 0.74, h * 0.17, w * 0.12, h * 0.08);
      g.beginPath(); g.ellipse(w * 0.8, h * 0.32, w * 0.07, h * 0.02, 0, 0, Math.PI * 2); g.stroke();
      const bx = w * (0.4 + r() * 0.2), by = h * 0.42, br = h * 0.11;
      g.fillStyle = "#f26a1b"; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#3a1608"; g.lineWidth = w * 0.008;
      g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.moveTo(bx - br, by); g.lineTo(bx + br, by); g.moveTo(bx, by - br); g.lineTo(bx, by + br); g.stroke();
      fighter(g, w * 0.3, h * 0.97, h * 0.5, 1, "#151018", true);
      break;
    }
    case "Puzzle": {
      const cols = ["#ff3b6b", "#2fd4ff", "#ffd21f", "#4cff6a", "#b46bff"];
      const R = w / 14;
      for (let row = 0; row < 5; row++) for (let c = 0; c < 7; c++) {
        if (row > 2 && r() < 0.5) continue;
        const x = R * (1.3 + c * 2 + (row % 2)), y = R * (1.4 + row * 1.75);
        g.fillStyle = cols[Math.floor(r() * cols.length)]; g.beginPath(); g.arc(x, y, R * 0.92, 0, Math.PI * 2); g.fill();
        g.fillStyle = "rgba(255,255,255,0.6)"; g.beginPath(); g.arc(x - R * 0.3, y - R * 0.3, R * 0.25, 0, Math.PI * 2); g.fill();
      }
      // the launcher's arrow
      g.fillStyle = "#fff"; g.save(); g.translate(w * 0.5, h * 0.95); g.rotate(-0.35);
      g.fillRect(-w * 0.012, -h * 0.28, w * 0.024, h * 0.28); g.beginPath(); g.moveTo(-w * 0.05, -h * 0.26); g.lineTo(0, -h * 0.36); g.lineTo(w * 0.05, -h * 0.26); g.fill();
      g.restore();
      break;
    }
    case "Rhythm": {
      grid("rgba(255,80,220,0.6)");
      const cols = ["#ff3b6b", "#2fd4ff", "#4cff6a", "#ffd21f"], rots = [Math.PI / 2, Math.PI, 0, -Math.PI / 2];
      for (let k = 0; k < 4; k++) {
        g.save(); g.translate(w * (0.17 + k * 0.22), h * 0.34); g.rotate(rots[k]); g.fillStyle = cols[k];
        const s = w * 0.07;
        g.beginPath(); g.moveTo(0, -s); g.lineTo(s, 0); g.lineTo(s * 0.4, 0); g.lineTo(s * 0.4, s); g.lineTo(-s * 0.4, s); g.lineTo(-s * 0.4, 0); g.lineTo(-s, 0); g.closePath(); g.fill();
        g.restore();
      }
      break;
    }
    default:
      sun(w * 0.5, hz, h * 0.25); grid("rgba(255,255,255,0.4)");
  }
  // printed: halftone dots and a little grain
  g.fillStyle = "rgba(0,0,0,0.12)";
  for (let y = 0; y < h; y += w / 60) for (let x = (y / (w / 60)) % 2 ? w / 120 : 0; x < w; x += w / 60) { g.beginPath(); g.arc(x, y, w / 400, 0, Math.PI * 2); g.fill(); }
}
