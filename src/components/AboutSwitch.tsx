"use client";

import { useSyncExternalStore } from "react";
import { lightInk } from "@/lib/stage";
import AboutStory from "./AboutStory";
import AboutStatic from "./AboutStatic";

const never = () => () => {};

/**
 * Phones and tablets (touch: `lightInk`) get the still About page, desktop the animated one.
 * The static HTML holds the still version (all the text is in it); a desktop browser swaps to
 * the animated page right after loading (the first-load counter covers it), and page changes
 * inside the site pick the right one straight away.
 */
export default function AboutSwitch() {
  const still = useSyncExternalStore(never, lightInk, () => true);
  return still ? <AboutStatic /> : <AboutStory />;
}
