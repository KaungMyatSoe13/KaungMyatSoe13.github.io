/**
 * Frees a canvas's WebGL memory once the canvas has left the page. iOS keeps a dead context's
 * GPU memory until garbage collection, and in-app browsers (the Google app) have less memory, so
 * a few page changes made them reload the page. It waits and checks the canvas is really gone, so
 * React's dev double-mount (the same canvas, still in the page) keeps its context.
 */
export function releaseGl(canvas: HTMLCanvasElement | null | undefined, ms = 1500) {
  if (!canvas) return;
  window.setTimeout(() => {
    if (canvas.isConnected) return;
    try { (canvas.getContext("webgl2") as WebGL2RenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext(); } catch {}
    canvas.width = canvas.height = 1;
  }, ms);
}
