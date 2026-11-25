/**
 * Fetch files a visitor will probably need next into the browser cache, at low priority, so
 * the next page opens fast without the first load paying for every 3D model on the site.
 * Called on intent (hovering About, resting on a project card). Skipped on data-saver or
 * slow connections; each file only once.
 */
const seen = new Set<string>();

export function prefetch(...urls: (string | undefined)[]) {
  if (typeof window === "undefined") return;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData || (c?.effectiveType && /(^|-)2g|3g/.test(c.effectiveType))) return;
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    fetch(u, { priority: "low" } as RequestInit).catch(() => seen.delete(u));
  }
}

/** The About page's heavy files (its TV and the photo the particles are made from). */
export const ABOUT_FILES = ["/about/tv.glb", "/about/me2-cut.webp", "/about/tv-television.glb", "/about/tv-vintage.glb", "/about/tv-retro-white.glb"];
