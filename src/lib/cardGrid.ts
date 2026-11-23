/**
 * Where the middle project screen sits on the home showcase, as a grid of screen points.
 * The home page and the project page both use this, so the clicked screen can travel
 * between them without ever disappearing.
 */
export const CARD_W = 2.45;   // card width in "screen heights" (screen height = 2)
export const CARD_AR = 1.55;  // card width / height (covers are cropped to this)
export const BEND = 0.1;      // lens strength across the whole picture
export const EDGE = 0.11;     // extra bend that only shows near the screen edges
export const PARALLAX = 0.045;

export const GRID = 9;        // grid points per side
export const CARD_KEY = "kfolio:card";

/** strip → screen (inverse of the shader's lensFwd), Newton on the radius */
export function lensInv(x: number, y: number, k: number): [number, number] {
  const R = Math.hypot(x, y);
  if (R < 1e-6) return [x, y];
  let r = R;
  for (let i = 0; i < 8; i++) {
    const r2 = r * r;
    const f = r + k * r2 * r + EDGE * r2 * r2 * r - R;
    const d = 1 + 3 * k * r2 + 5 * EDGE * r2 * r2;
    r -= f / d;
  }
  return [(x * r) / R, (y * r) / R];
}

/**
 * The middle card's outline on screen: GRID×GRID points, row-major from the top-left of
 * the picture, as fractions of the viewport (0..1, y down).
 */
export function cardGrid(vw: number, vh: number, mx = 0, my = 0, bend = BEND): Float32Array {
  const aspect = vw / vh;
  const H = CARD_W / CARD_AR;
  const out = new Float32Array(GRID * GRID * 2);
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const u = i / (GRID - 1), v = j / (GRID - 1);
      const sx = (u - 0.5) * CARD_W, sy = (0.5 - v) * H;
      let [qx, qy] = lensInv(sx, sy, bend);
      qx += mx * PARALLAX; qy += my * PARALLAX;
      const k = (j * GRID + i) * 2;
      out[k] = qx / aspect * 0.5 + 0.5;
      out[k + 1] = 0.5 - qy * 0.5;
    }
  return out;
}

/** Bilinear lookup in a cardGrid at (u, v) in 0..1. */
export function gridAt(g: Float32Array, u: number, v: number): [number, number] {
  const fx = Math.min(GRID - 1.0001, Math.max(0, u * (GRID - 1)));
  const fy = Math.min(GRID - 1.0001, Math.max(0, v * (GRID - 1)));
  const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
  const at = (a: number, b: number, c: number) => g[(b * GRID + a) * 2 + c];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (k: number) => lerp(lerp(at(i, j, k), at(i + 1, j, k), tx), lerp(at(i, j + 1, k), at(i + 1, j + 1, k), tx), ty);
  return [c(0), c(1)];
}
