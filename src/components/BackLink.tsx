"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { leaveWithParticles } from "./TransitionLayer";

/**
 * A link back to the project list. On click, the project image and title burst into
 * particles that fly across the screen, then the list page regathers them into the names.
 */
export default function BackLink({ children, className = "link" }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const href = "/#work";
  return (
    <Link
      className={className}
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        e.preventDefault();
        router.prefetch(href);
        const img = document.querySelector<HTMLImageElement>(".pimg__img");
        const title = document.querySelector<HTMLElement>(".detail__title");
        const sources = [
          ...(img ? [{ el: img, img }] : []),
          ...(title ? [{ el: title }] : []),
        ];
        // hide the title's particle canvas too, so only the burst shows
        document.querySelectorAll<HTMLElement>(".ptitle .names-canvas").forEach((c) => (c.style.opacity = "0"));
        leaveWithParticles({ sources, go: () => router.push(href) });
      }}
    >
      {children}
    </Link>
  );
}
