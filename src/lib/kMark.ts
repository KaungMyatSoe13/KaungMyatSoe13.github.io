/**
 * The "K" mark, drawn as three thick round-capped strokes in a 100 x 100 box.
 * The ink effect blurs and re-thresholds these strokes, which melts the joints
 * into one soft, rounded letter. The SVG fallback uses the same strokes.
 */
export type KStroke = { d: string; w: number };

export const K_STROKES: KStroke[] = [
  // stem
  { d: "M 27 17 L 27 83", w: 27 },
  // upper arm: leaves the stem low, swings up and out
  { d: "M 33 60 C 46 48, 60 30, 76 18", w: 25 },
  // leg: kicks down and out with a fuller foot
  { d: "M 42 50 C 56 58, 68 70, 79 83", w: 29 },
];
