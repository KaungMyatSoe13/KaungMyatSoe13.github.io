import InkHero from "@/components/InkHero";
import ArcadeShowcase from "@/components/ArcadeShowcase";
import HomeTv from "@/components/HomeTv";

/**
 * Home: the arcade (whole cabinet, K on its screen) with the ink layer over it. Scrolling
 * floods ink out of the arcade's screen, then drains it; meanwhile the arcade spins round
 * into the showcase.
 */
export default function Home() {
  return (
    <main className="home">
      <HomeTv />
      <InkHero arcade />
      {/* anchor for /#work: scrolls to the end of the hero (the showcase is pinned under it) */}
      <div id="work" className="work-anchor" aria-hidden="true" />
      <ArcadeShowcase />
    </main>
  );
}
