/**
 * The "K" mark in a 100 x 100 box, drawn as filled shapes, thick round strokes and cut-outs.
 * The hero blurs and re-thresholds the result, so joints melt into one soft letter.
 *
 * Character (owner's design): a heavy stem with a rounded notch bitten out of its upper
 * left side, a thick arm ending in a round top with a hole punched in it, and a leg that curls up into a tall,
 * rounded foot.
 */
export type KPart =
  | { kind: "fill"; d: string }
  | { kind: "stroke"; d: string; w: number }
  | { kind: "cut"; d: string };

export const K_PARTS: KPart[] = [
  // stem
  { kind: "fill", d: "M 11.5 6 L 20 6 C 24 6, 25.6 9, 25.6 13 L 25.6 84 C 25.6 90, 22 94, 16 94 L 15 94 C 9 94, 6 90, 6 84 L 6 11.5 C 6 8, 8.5 6, 11.5 6 Z" },
  // arm, thick, ending in a round top
  { kind: "stroke", d: "M 26 50 C 34 42, 50 26, 59 17", w: 26 },
  // leg, curling up into the tall foot
  { kind: "fill", d: "M 24 47 L 38 50 C 46 58, 56 70, 62 74.5 C 64.5 76, 66 74, 66.3 71 C 67 66, 70 64.2, 75 64.2 C 80 64.2, 84 68, 84 73 L 84 87 C 84 91.5, 80 94, 76 94 L 58 94 C 46 92, 36 82, 30 74 L 24 74 Z" },
  // round hole in the arm's top
  { kind: "cut", d: "M 54.5 17 A 4.5 4.5 0 1 0 63.5 17 A 4.5 4.5 0 1 0 54.5 17 Z" },
  // the rounded notch in the stem's upper left
  { kind: "cut", d: "M 2 19.6 L 12 19.6 A 3.25 3.25 0 0 1 12 26.1 L 2 26.1 Z" },
];

/** Draw the K in white on whatever transform the context already has (100 x 100 units). */
export function drawK(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of K_PARTS) {
    ctx.globalCompositeOperation = p.kind === "cut" ? "destination-out" : "source-over";
    if (p.kind === "stroke") {
      ctx.lineWidth = p.w;
      ctx.stroke(new Path2D(p.d));
    } else {
      ctx.fill(new Path2D(p.d));
    }
  }
  ctx.restore();
}

/** Where the K sits on a w x h surface: a square box, centred (shared by every K renderer). */
export function kBox(w: number, h: number) {
  const s = Math.min(h * 0.6, w * 0.82);
  return { s, x: (w - s) / 2, y: (h - s) / 2 };
}
