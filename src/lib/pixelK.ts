/**
 * The site's K as chunky arcade pixels (our own design): yellow blocks with a one-pixel
 * black outline and a hard drop shadow down-right, like an 80s title screen.
 * Used by the logo (KLogo) and the favicon (src/app/icon.svg, generated from the same grid).
 */
export const PIXEL_K = [
  "XXX..XXX",
  "XXX.XXX.",
  "XXXXXX..",
  "XXXXX...",
  "XXXXXX..",
  "XXX.XXX.",
  "XXX..XXX",
];

/** Cells of each layer on a (w+3) × (h+3) grid: the outline + shadow, then the yellow. */
export function pixelKCells() {
  const h = PIXEL_K.length, w = PIXEL_K[0].length;
  const fill = new Set<string>();
  PIXEL_K.forEach((row, y) => [...row].forEach((c, x) => { if (c === "X") fill.add(`${x + 1},${y + 1}`); }));
  const ink = new Set<string>();
  for (const k of fill) {
    const [x, y] = k.split(",").map(Number);
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
      // the outline (1 cell all round) plus the shadow (one more cell down and right)
      if ((dx <= 1 && dy <= 1) || (dx >= 0 && dy >= 0)) ink.add(`${x + dx},${y + dy}`);
    }
  }
  const cells = (s: Set<string>) => [...s].map((k) => k.split(",").map(Number) as [number, number]);
  return { w: w + 3, h: h + 3, ink: cells(ink), fill: cells(fill) };
}
