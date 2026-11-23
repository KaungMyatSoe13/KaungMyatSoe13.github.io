/**
 * Glitch switch between pages: the current page breaks up (slices jump sideways, red/blue
 * split, flicker) and cuts to static, we navigate, and the next page arrives through the
 * same glitch, settling into place. The flag in sessionStorage tells the next page to play it.
 * (Names kept from the earlier TV version so callers don't change.)
 */
export const TV_KEY = "kfolio:tv";
const OUT_MS = 480;
const IN_MS = 700;

function noise() {
  const n = document.createElement("div");
  n.className = "gx-noise";
  document.body.appendChild(n);
  return n;
}

export function tvOff(go: () => void) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { go(); return; }
  document.querySelector<HTMLElement>("main")?.classList.add("gx-out");
  const n = noise();
  n.classList.add("gx-noise--out");
  try { sessionStorage.setItem(TV_KEY, String(Date.now())); } catch {}
  window.setTimeout(go, OUT_MS);
}

/** Call before the first paint of the next page (layout effect). */
export function tvOn(page: HTMLElement | null, scrollTo?: () => number) {
  if (scrollTo) {
    const go = () => window.scrollTo({ top: scrollTo(), behavior: "instant" as ScrollBehavior });
    go(); requestAnimationFrame(() => { go(); requestAnimationFrame(go); });
    window.setTimeout(go, 120);
  }
  let t = 0;
  try { t = Number(sessionStorage.getItem(TV_KEY) || 0); sessionStorage.removeItem(TV_KEY); } catch {}
  document.querySelectorAll(".gx-noise").forEach((x) => x.remove());
  if (!page || !t || Date.now() - t > 5000) return;
  page.classList.add("gx-in");
  const n = noise();
  n.classList.add("gx-noise--in");
  window.setTimeout(() => { page.classList.remove("gx-in"); n.remove(); }, IN_MS);
}
