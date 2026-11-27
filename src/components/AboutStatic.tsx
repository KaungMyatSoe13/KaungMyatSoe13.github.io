"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { aboutIntro, contact, experience, skills, type SkillIcon } from "@/content/about";
import { stack } from "@/content/stack";
import { site } from "@/content/site";
import { tvOn } from "@/lib/tv";
import { lightInk } from "@/lib/stage";
import { drawIcon } from "./AboutStory";
import Credits from "./Credits";
import KLogo from "./KLogo";
import TvLink from "./TvLink";

/** One skill's icon, drawn once (no particles, no animation). */
function Icon({ icon }: { icon: SkillIcon }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let alive = true;
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!alive) return;
      const g = c.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, c.width, c.height);
      drawIcon(g, icon);
    });
    return () => { alive = false; };
  }, [icon]);
  return <canvas ref={ref} className="abs__icon" width={1000} height={720} aria-hidden="true" />;
}

/** The contact form without the TV: submit opens the visitor's mail app (the site is static). */
function StaticContact() {
  const [sent, setSent] = useState(false);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name")), from = String(f.get("email")), msg = String(f.get("message"));
    window.location.href = `mailto:${site.email}?subject=${encodeURIComponent(`Hello from ${name}`)}&body=${encodeURIComponent(`${msg}\n\n${name}\n${from}`)}`;
    setSent(true);
  };
  return (
    <section id="contact" className="abs__sec abs__contact" aria-labelledby="abs-contact">
      <div className="abs__head">
        <p className="ab__label"><span>(04)</span> Contact</p>
        <p className="abs__note">{contact.note}</p>
      </div>
      <form className="ab__form abs__form" onSubmit={onSubmit}>
        <h2 id="abs-contact" className="ab__contact-title">{contact.title}</h2>
        <p className="ab__contact-body">{contact.body}</p>
        <label><span>Name</span><input name="name" required autoComplete="name" /></label>
        <label><span>Email</span><input name="email" type="email" required autoComplete="email" /></label>
        <label><span>Message</span><textarea name="message" rows={4} required /></label>
        <div className="ab__form-foot">
          <button type="submit">▶ Send</button>
          <p aria-live="polite">{sent ? "Your mail app should be open. If not, " : "Or write to "}<a href={`mailto:${site.email}`}>{site.email}</a></p>
        </div>
      </form>
      <div className="abs__foot"><Credits /></div>
    </section>
  );
}

/**
 * The About page on phones and tablets (owner: the animated one glitched there): the same
 * content, standing still. The real photo instead of particles, the six skills with their icons
 * drawn once, the tech logos as a plain grid, a simple timeline and the form. No WebGL, no TV,
 * no scroll-driven or glitch animations. Desktop keeps AboutStory (AboutSwitch picks).
 */
export default function AboutStatic() {
  const mainRef = useRef<HTMLElement>(null);
  // the page-in glitch and /about/#contact, as on desktop (skipped while a desktop page is
  // still hydrating this version before it switches to the animated one)
  useLayoutEffect(() => {
    if (!lightInk()) return;
    tvOn(mainRef.current, () => (location.hash === "#contact" ? (document.getElementById("contact")?.offsetTop ?? 0) : 0));
  }, []);

  return (
    <main ref={mainRef} className="ab abs">
      <header className="ab__top">
        <Link className="brand" href="/"><KLogo />{site.name}</Link>
        <TvLink className="link" href="/#work">Selected work →</TvLink>
      </header>

      <section className="abs__me" aria-labelledby="abs-me">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
        <img className="abs__photo" src={aboutIntro.photo} alt={`${site.name}, a black and white photo`} />
        <div className="abs__me-text">
          <p className="ab__label"><span>(01)</span> {aboutIntro.label}</p>
          <h1 id="abs-me" className="ab__title">
            <span>{aboutIntro.name}</span>
            <span>{aboutIntro.role}</span>
          </h1>
          {aboutIntro.body.map((b) => <p key={b} className="ab__body abs__body">{b}</p>)}
          <p className="ab__links">
            <a href={`mailto:${site.email}`}>{site.email}</a>
            <a href={site.resume} target="_blank" rel="noopener">Résumé ↗</a>
            {site.socials.map((s) => <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer">{s.label} ↗</a>)}
          </p>
        </div>
      </section>

      <section className="abs__sec" aria-labelledby="abs-do">
        <div className="abs__head">
          <p className="ab__label"><span>(02)</span> What I do</p>
          <p className="abs__note">From the first sketch to the last API call</p>
        </div>
        <h2 id="abs-do" className="sr-only">What I do</h2>
        <ol className="abs__skills">
          {skills.map((k, i) => (
            <li key={k.name}>
              <Icon icon={k.icon} />
              <p className="abs__num">{String(i + 1).padStart(2, "0")}</p>
              <h3>{k.name}</h3>
              <p className="abs__tag">{k.tagline}</p>
              <p className="abs__text">{k.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="abs__sec" aria-label="Tech stack">
        <ul className="abs__stack">
          {stack.map((t) => (
            <li key={t.name} data-main={t.main ? "" : undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.d} fill="currentColor" /></svg>
              <span>{t.name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="abs__sec" aria-labelledby="abs-exp">
        <div className="abs__head">
          <p className="ab__label"><span>(03)</span> Experience</p>
        </div>
        <h2 id="abs-exp" className="ab__lead abs__lead">
          Since <b>{experience[0].year}</b>: four levels cleared. Still leveling up.
        </h2>
        <ol className="abs__time">
          {experience.map((x) => (
            <li key={x.title}>
              <p className="abs__year">{x.year}{x.now && <i>Now</i>}</p>
              <h3>{x.title}</h3>
              <p className="abs__where">{x.where}</p>
              <p className="abs__text">{x.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <StaticContact />
    </main>
  );
}
