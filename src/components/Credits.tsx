"use client";

import { projects } from "@/content/projects";
import { music } from "@/lib/music";
import { contact } from "@/content/about";
import { arcadeGames } from "@/content/arcadeGames";

type Credit = { title: string; titleUrl: string; author: string; authorUrl: string; license: string; licenseUrl: string; where: string };
const CC_BY = { license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" };

/** Everything on the site made by someone else, in one place (the About page's last section).
 *  CC BY asks for exactly this: title, author, source, licence, and that it was changed (all
 *  the models were: textures, labels, screens). Keep it. */
const MODELS: Credit[] = [
  { title: "Arcade machine Street Fighter", titleUrl: "https://sketchfab.com/3d-models/arcade-machine-street-fighter-092c7ef090e44b5d896c3960c1804ea9", author: "bvbwork510524", authorUrl: "https://sketchfab.com/bvbwork510524", ...CC_BY, where: "Home" },
  { title: "DS game card", titleUrl: "https://sketchfab.com/3d-models/ds-game-card-822e8ff1a12946048a8fa9dbadf3379d", author: "maney", authorUrl: "https://sketchfab.com/maney", ...CC_BY, where: "Home" },
  ...contact.credits.map((c) => ({ ...c, ...CC_BY, where: "About" })),
  ...projects.filter((p) => p.scene3d).map((p) => ({ ...p.scene3d!.credit, where: p.name })),
];

export default function Credits() {
  return (
    // a small dropdown at the very bottom: there, but never in the spotlight
    <details id="credits" className="credits" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) music.blip(); }}>
      <summary>Credits</summary>
      <div className="credits__body">
      <p className="credits__lead">The 3D models, music and artwork here were made by other people. Thank you! All the models were modified (textures, labels, screens).</p>
      <div className="credits__grid">
        <div>
          <h3>3D models</h3>
          <ul>
            {MODELS.map((m) => (
              <li key={m.title + m.where}>
                <span className="credits__where">{m.where}</span>
                <span>
                  <a href={m.titleUrl} target="_blank" rel="noopener noreferrer">{m.title}</a> by{" "}
                  <a href={m.authorUrl} target="_blank" rel="noopener noreferrer">{m.author}</a> ·{" "}
                  <a href={m.licenseUrl} target="_blank" rel="noopener noreferrer">{m.license}</a> · modified
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Music</h3>
          <ul><li>Street Fighter II soundtrack (Game Start, Stage Select, Round, Continue, Credits Roll) © Capcom.</li></ul>
          <h3>Game covers</h3>
          <ul><li>{arcadeGames.map((g) => g.title).join(", ")}: covers and flyers © their publishers.</li></ul>
          <h3>Logos</h3>
          <ul><li>Tech logos from <a href="https://simpleicons.org" target="_blank" rel="noopener noreferrer">Simple Icons</a> (CC0); the brands belong to their owners.</li></ul>
          <h3>Fonts</h3>
          <ul><li>Inter Tight, JetBrains Mono and Doto, from Google Fonts (SIL Open Font License).</li></ul>
        </div>
      </div>
      </div>
    </details>
  );
}
