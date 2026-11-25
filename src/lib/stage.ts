/**
 * Shared between the home page's two canvases: where the ink floods out from (and drains
 * back to), in viewport uv (0..1, y up). The arcade sets it to its screen's centre.
 */
export const floodOrigin = { x: 0.5, y: 0.5 };

/**
 * A jump that should not animate: until `until` (performance.now() ms) the scroll-driven
 * canvases go straight to the scroll position instead of easing there (the K logo's glitch
 * jump back to the landing sets it; see `glitchJump` in tv.ts).
 */
export const snap = { until: 0 };
