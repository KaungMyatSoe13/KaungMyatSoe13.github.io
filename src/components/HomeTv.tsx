"use client";

import { useLayoutEffect } from "react";
import { tvOn } from "@/lib/tv";

/** Plays the old-TV power-on on the home page when arriving from a TV switch. */
export default function HomeTv() {
  useLayoutEffect(() => {
    // arriving at /#work: the projects are the bottom of the page (under the drained ink)
    const toWork = location.hash === "#work";
    tvOn(document.querySelector<HTMLElement>("main.home"), toWork ? () => document.documentElement.scrollHeight : undefined);
    if (!toWork) return;
    // the router's own jump to the #work anchor can land a little after ours (short of the
    // bottom on phones): go to the very bottom again, so the showcase is pinned
    const bottom = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" as ScrollBehavior });
    const ts = [300, 700].map((ms) => window.setTimeout(bottom, ms));
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, []);
  return null;
}
