"use client";

import { useCallback, useRef, useState } from "react";
import ParticleNames from "./ParticleNames";

/**
 * The project page title, drawn as particles that start scattered over the whole screen
 * and regather (like the image below it), then keep the same frayed, fading ending as the
 * names on the home page. The real heading stays in
 * the DOM (transparent once particles are running) for search engines and screen readers.
 */
export default function ParticleTitle({ text, id }: { text: string; id: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // "pending" until we know: the text stays hidden so it never flashes before the particles.
  const [on, setOn] = useState<boolean | "pending">("pending");
  const onReady = useCallback((ok: boolean) => setOn(ok), []);
  return (
    <div ref={wrapRef} className="ptitle" data-particles={on}>
      <ParticleNames sectionRef={wrapRef} onReady={onReady} arrival="gather" />
      <h1 id={id} className="detail__title work-row__name" aria-label={text}>
        {Array.from(text).map((ch, i) => (
          <span key={i} className="roll__ch" aria-hidden="true">
            <span>{ch === " " ? " " : ch}</span>
          </span>
        ))}
      </h1>
    </div>
  );
}
