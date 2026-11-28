"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { aboutIntro, contact, experience, skills } from "@/content/about";
import { stack } from "@/content/stack";
import { site } from "@/content/site";
import { tvOn } from "@/lib/tv";
import { lightInk } from "@/lib/stage";
import { RECAPTCHA_KEY, loadRecaptcha, openMailApp, sendContact } from "@/lib/contact";
import ChannelTv from "./ChannelTv";
import Credits from "./Credits";
import KLogo from "./KLogo";
import TvLink from "./TvLink";

/** The contact form without the TV: sent through the Worker (Gmail SMTP); the mail app if that fails. */
function StaticContact() {
  const [status, setStatus] = useState<"" | "sending" | "sent" | "mailapp">("");
  const [err, setErr] = useState("");
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === "sending") return;
    const form = e.currentTarget, f = new FormData(form);
    setStatus("sending"); setErr("");
    const r = await sendContact(f);
    if (r.ok) { setStatus("sent"); form.reset(); return; }
    if (r.fallback) { openMailApp(String(f.get("name")), String(f.get("email")), String(f.get("message"))); setStatus("mailapp"); return; }
    setStatus(""); setErr(r.message);
  };
  return (
    <section id="contact" className="abs__sec abs__contact" aria-labelledby="abs-contact">
      <div className="abs__head">
        <p className="ab__label"><span>(04)</span> Contact</p>
        <p className="abs__note">{contact.note}</p>
      </div>
      <form className="ab__form abs__form" onFocus={() => void loadRecaptcha()} onSubmit={onSubmit}>
        <h2 id="abs-contact" className="ab__contact-title">{contact.title}</h2>
        <p className="ab__contact-body">{contact.body}</p>
        <label><span>Name</span><input name="name" required autoComplete="name" /></label>
        <label><span>Email</span><input name="email" type="email" required autoComplete="email" /></label>
        <label><span>Message</span><textarea name="message" rows={4} required maxLength={4000} /></label>
        {/* hidden from people; bots fill it in and are ignored */}
        <label className="hp" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
        <div className="ab__form-foot">
          <button type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "▶ Send"}</button>
          <p aria-live="polite">
            {err ? <>{err} </> : status === "sent" ? <>Sent! K will get back to you soon. </> : status === "mailapp" ? <>Your mail app should be open. If not, write to </> : <>Or write to </>}
            <a href={`mailto:${site.email}`}>{site.email}</a>
          </p>
        </div>
        {RECAPTCHA_KEY && <p className="abs__rc">This site is protected by reCAPTCHA and the Google <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> apply.</p>}
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
  const [skill, setSkill] = useState(0);
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
        {/* a TV with six channels: tap a channel (or swipe the TV), the screen and text change */}
        <div className="abs__do">
          <ChannelTv index={skill} onSwipe={(d) => setSkill((v) => (v + d + skills.length) % skills.length)} />
          <div className="abs__do-side">
            <div className="abs__chips" role="tablist" aria-label="What I do">
              {skills.map((k, i) => (
                <button key={k.name} type="button" role="tab" aria-selected={i === skill} onClick={() => setSkill(i)}>
                  <b>{String(i + 1).padStart(2, "0")}</b><span>{k.name}</span>
                </button>
              ))}
            </div>
            <div className="abs__do-text" role="tabpanel" aria-live="polite">
              <p className="abs__num">CH {String(skill + 1).padStart(2, "0")} · {skills[skill].tagline}</p>
              <h3>{skills[skill].name}</h3>
              <p className="abs__text">{skills[skill].body}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="abs__sec" aria-label="Tech stack">
        {/* two rows of logos gliding past in opposite directions (CSS only; still with reduced motion) */}
        <div className="abs__marq">
          {[stack.slice(0, Math.ceil(stack.length / 2)), stack.slice(Math.ceil(stack.length / 2))].map((row, r) => (
            <div key={r} className="abs__row" data-dir={r}>
              <ul>
                {[...row, ...row].map((t, i) => (
                  <li key={`${t.name}-${i}`} data-main={t.main ? "" : undefined} aria-hidden={i >= row.length || undefined}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.d} fill="currentColor" /></svg>
                    <span>{t.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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
