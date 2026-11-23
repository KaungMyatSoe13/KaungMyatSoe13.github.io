/**
 * Hand-off of scattered particles between pages.
 *
 * When a page transition starts, the leaving page writes where its particles are (in
 * viewport pixels). The TransitionLayer (in the root layout, so it survives the route
 * change) keeps drawing them while the next page loads, and the next page starts its own
 * particles from exactly these spots. The next page signals "ready" once it is drawing,
 * and the layer fades out. Result: no empty frame between the two pages.
 */
export type ScatterState = {
  x: Float32Array;
  y: Float32Array;
  r: Float32Array; // colour 0..1 (rgb), so image particles keep their colour across pages
  g: Float32Array;
  b: Float32Array;
  n: number;
  t: number;
  active: boolean;
  ink: boolean; // all particles are dark ink (draw with one colour)
};

export const scatter: ScatterState = {
  x: new Float32Array(0), y: new Float32Array(0),
  r: new Float32Array(0), g: new Float32Array(0), b: new Float32Array(0),
  n: 0, t: 0, active: false, ink: true,
};

export const READY_EVENT = "kfolio:particles-ready";

/** Make room for n particles and mark the hand-off as active. `ink`: all dark particles. */
export function beginScatter(n: number, ink = false) {
  if (scatter.x.length < n) {
    scatter.x = new Float32Array(n); scatter.y = new Float32Array(n);
    scatter.r = new Float32Array(n); scatter.g = new Float32Array(n); scatter.b = new Float32Array(n);
  }
  if (ink) { scatter.r.fill(0.055, 0, n); scatter.g.fill(0.055, 0, n); scatter.b.fill(0.055, 0, n); }
  scatter.ink = ink;
  scatter.n = n;
  scatter.t = performance.now();
  scatter.active = true;
}

/** True if a hand-off happened in the last few seconds (the next page should use it). */
export function scatterFresh() {
  return scatter.active && scatter.n > 0 && performance.now() - scatter.t < 5000;
}

/** The next page calls this once it is drawing its own particles. */
export function particlesReady() {
  window.dispatchEvent(new Event(READY_EVENT));
}
