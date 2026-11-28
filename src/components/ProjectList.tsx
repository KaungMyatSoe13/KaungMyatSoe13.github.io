"use client";

import GridLines from "./GridLines";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ParticleNames from "./ParticleNames";
import KLogo from "./KLogo";
import { projects, type Project } from "@/content/projects";
import { site } from "@/content/site";

/** How far apart (in row-progress units) each letter of a "train" follows the one ahead. */
const LAG = 0.035;

/**
 * Letters roll up on hover; the visible text stays one readable string for screen readers.
 * When particles are on (see ParticleNames), this text is transparent and only marks
 * where each letter goes; without WebGL it is shown as normal text.
 */
function RollText({ text, row }: { text: string; row: number }) {
  const chars = Array.from(text);
  const n = chars.length;
  const dir = 1; // every name arrives from the right, like trains pulling into the same station
  return (
    <span
      className="roll"
      aria-label={text}
      style={{
        ["--dir" as string]: dir,
        ["--rd" as string]: (row * 0.1).toFixed(2),
        ["--Gmax" as string]: (1 + (n - 1) * LAG).toFixed(3),
      }}
    >
      {chars.map((ch, i) => (
        <span
          key={i}
          className="roll__ch"
          style={{ ["--i" as string]: i, ["--li" as string]: dir === 1 ? i : n - 1 - i }}
          aria-hidden="true"
        >          <span>{ch === " " ? " " : ch}</span>
          <span>{ch === " " ? " " : ch}</span>
        </span>
      ))}
    </span>
  );
}

function Row({
  p,
  index,
  onEnter,
  onLeave,
  onOpen,
}: {
  p: Project;
  index: number;
  onEnter: () => void;
  onLeave: () => void;
  onOpen: (e: React.MouseEvent, href: string, index: number) => void;
}) {
  const href = `/projects/${p.slug}/`;
  return (
    <li style={{ ["--step" as string]: index }}>
      <Link className="work-row" href={href} onClick={(e) => onOpen(e, href, index)} onFocus={onEnter} onBlur={onLeave}>
        <span className="work-row__no">[{String(index + 1).padStart(2, "0")}]</span>
        <span className="work-row__name" onPointerEnter={onEnter} onPointerLeave={onLeave}>
          <RollText text={p.name} row={index} />
        </span>
        <span className="work-row__tag">
          [{p.type} · {p.year}]
        </span>
        <span className="work-row__summary">{p.summary}</span>
      </Link>
    </li>
  );
}

export default function ProjectList() {
  const [active, setActive] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const hoverRef = useRef<number | null>(null);
  hoverRef.current = active;
  // "pending" until the particles report in: the names stay hidden so they never flash.
  const [particles, setParticles] = useState<boolean | "pending">("pending");
  const onParticles = useCallback((ok: boolean) => setParticles(ok), []);
  const router = useRouter();
  // Click: when particles are on, the names burst away first, then the inner page opens.
  const exitRef = useRef<{ row: number; t: number } | null>(null);
  const EXIT_MS = 700;
  const onOpen = useCallback(
    (e: React.MouseEvent, href: string, index: number) => {
      if (particles !== true || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      if (exitRef.current) return;
      exitRef.current = { row: index, t: performance.now() };
      router.prefetch(href);
      // Warm the cover image while the names scatter, so the next page starts at once.
      const pre = new Image();
      pre.src = projects[index].cover;
      pre.decode().catch(() => {});
      window.setTimeout(() => router.push(href), EXIT_MS);
    },
    [particles, router],
  );

  // Arrival progress (--g): 0 until the ink has drained, 1 once the section reaches the top.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--g", "1");
      el.dataset.labels = "on";
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const top = el.getBoundingClientRect().top;
      // Starts once the ink has mostly drained (section top at 45% of the screen), done at the top.
      const g = Math.min(1, Math.max(0, 1 - top / (window.innerHeight * 0.45)));
      el.style.setProperty("--g", g.toFixed(3));
      // labels fade in (timed) once the names have mostly arrived, and out if you scroll back
      const labels = g > 0.7 ? "on" : "off";
      if (el.dataset.labels !== labels) el.dataset.labels = labels;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);

  const year = new Date().getFullYear();

  return (
    <section
      ref={sectionRef}
      id="work"
      className="work"
      data-particles={particles}
      aria-labelledby="work-title"
    >
      {/* Without JavaScript there are no particles: show the names as text. */}
      <noscript>
        <style>{".work .work-row__name,.work .roll__ch>span:last-child{color:inherit!important}.work .work-bar,.work .work-intro,.work .work-row__no,.work .work-row__tag{opacity:1!important}"}</style>
      </noscript>
      <ParticleNames sectionRef={sectionRef} hoverRef={hoverRef} exitRef={exitRef} onReady={onParticles} />
        <GridLines />
      <header className="work-bar">
        <a className="brand work-bar__name" href="#top" aria-label={`${site.name}, back to top`}>
          <KLogo />
          {site.name}
        </a>
        <h2 id="work-title" className="work-bar__title">
          Selected work <span className="work-bar__count">({String(projects.length).padStart(2, "0")})</span>
        </h2>
        <a className="link" href={`mailto:${site.email}`}>
          Contact
        </a>
      </header>

      <ol className="work-list" data-active={active !== null}>
        {projects.map((p, i) => (
          <Row
            key={p.slug}
            p={p}
            index={i}
            onEnter={() => setActive(i)}
            onLeave={() => setActive((a) => (a === i ? null : a))}
            onOpen={onOpen}
          />
        ))}
      </ol>

      <p className="work-intro">{site.intro}</p>

      <footer className="work-bar work-bar--foot">
        <span>© {year}</span>
        <nav className="work-links" aria-label="Elsewhere">
          {site.resume && (
            <a className="link" href={site.resume} target="_blank" rel="noopener">
              Résumé
            </a>
          )}
          {site.socials.map((s) => (
            <a key={s.href} className="link" href={s.href} target="_blank" rel="noopener noreferrer">
              {s.label}
            </a>
          ))}
        </nav>
      </footer>

    </section>
  );
}
