/**
 * Shared between the home page's two canvases: where the ink floods out from (and drains
 * back to), in viewport uv (0..1, y up). The arcade sets it to its screen's centre.
 */
export const floodOrigin = { x: 0.5, y: 0.5 };

/**
 * Phones and tablets: the home ink is drawn by the arcade's own shader (the same flood shape,
 * no fluid sim, no second WebGL canvas). Real iOS Safari copies one WebGL canvas into another
 * badly (blank or slow), and the sim is heavy; on touch screens nobody stirs the ink anyway.
 */
export const lightInk = () =>
  typeof window !== "undefined" && (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1);

/**
 * A jump that should not animate: until `until` (performance.now() ms) the scroll-driven
 * canvases go straight to the scroll position instead of easing there (the K logo's glitch
 * jump back to the landing sets it; see `glitchJump` in tv.ts).
 */
export const snap = { until: 0 };

/** Safari itself on iPhone / iPad (not Chrome, Firefox, Edge or the Google app, which all run on
 *  WebKit too). Safari hides its toolbar while you scroll: there the showcase stays at the full
 *  height (lvh) and the project page at its first resolution, the versions that ran smoothly. */
export const iosSafari = () => typeof navigator !== "undefined" && navigator.maxTouchPoints > 1
  && /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent) && /Safari\//.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|YaBrowser|DuckDuckGo/.test(navigator.userAgent);
