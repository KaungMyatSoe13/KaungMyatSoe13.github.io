"use client";

import { useEffect, useRef, useState } from "react";
import { projects, type Project } from "@/content/projects";
import { site } from "@/content/site";

/** Letters roll up on hover; the visible text stays one readable string for screen readers. */
function RollText({ text }: { text: string }) {
  return (
    <span className="roll" aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span key={i} className="roll__ch" style={{ ["--i" as string]: i }} aria-hidden="true">
          <span>{ch === " " ? " " : ch}</span>
          <span>{ch === " " ? " " : ch}</span>
        </span>
      ))}
    </span>
  );
}

function Row({ p, index, onEnter, onLeave }: { p: Project; index: number; onEnter: () => void; onLeave: () => void }) {
  const href = p.links?.live ?? p.links?.code;
  const inner = (
    <>
      <span className="work-row__no">[{String(index + 1).padStart(2, "0")}]</span>
      <span className="work-row__name">
        <RollText text={p.name} />
      </span>
      <span className="work-row__tag">
        [{p.type} · {p.year}]
      </span>
      <span className="work-row__summary">{p.summary}</span>
    </>
  );
  const handlers = { onPointerEnter: onEnter, onPointerLeave: onLeave, onFocus: onEnter, onBlur: onLeave };
  return (
    <li>
      {href ? (
        <a className="work-row" href={href} target="_blank" rel="noopener noreferrer" {...handlers}>
          {inner}
        </a>
      ) : (
        <div className="work-row" {...handlers}>
          {inner}
        </div>
      )}
    </li>
  );
}

export default function ProjectList() {
  const [active, setActive] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // The preview card trails the pointer.
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    let x = window.innerWidth / 2, y = window.innerHeight / 2, cx = x, cy = y, raf = 0;
    const move = (e: PointerEvent) => { x = e.clientX; y = e.clientY; };
    const tick = () => {
      cx += (x - cx) * 0.16;
      cy += (y - cy) * 0.16;
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);

  const year = new Date().getFullYear();

  return (
    <section id="work" className="work" aria-labelledby="work-title">
      <header className="work-bar">
        <span className="work-bar__name">{site.name}</span>
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
          />
        ))}
      </ol>

      <p className="work-intro">{site.intro}</p>

      <footer className="work-bar work-bar--foot">
        <span>© {year}</span>
        <nav className="work-links" aria-label="Elsewhere">
          <a className="link" href={site.resume} target="_blank" rel="noopener">
            Résumé
          </a>
          {site.socials.map((s) => (
            <a key={s.href} className="link" href={s.href} target="_blank" rel="noopener noreferrer">
              {s.label}
            </a>
          ))}
        </nav>
      </footer>

      <div ref={previewRef} className="preview" aria-hidden="true">
        {projects.map((p, i) => (
          <div key={p.slug} className="preview__card" data-on={active === i}>
            {p.preview ? (
              <video src={p.preview} poster={p.cover} muted loop playsInline preload="none"
                ref={(v) => { if (!v) return; if (active === i) v.play().catch(() => {}); else v.pause(); }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.cover} alt="" loading="lazy" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
