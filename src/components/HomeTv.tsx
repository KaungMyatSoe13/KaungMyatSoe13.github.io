"use client";

import { useLayoutEffect } from "react";
import { tvOn } from "@/lib/tv";

/** Plays the old-TV power-on on the home page when arriving from a TV switch. */
export default function HomeTv() {
  useLayoutEffect(() => {
    // arriving at /#work: the projects are the bottom of the page (under the drained ink)
    const toWork = location.hash === "#work";
    tvOn(document.querySelector<HTMLElement>("main.home"), toWork ? () => document.documentElement.scrollHeight : undefined);
  }, []);
  return null;
}
