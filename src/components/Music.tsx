"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { music, type Scene } from "@/lib/music";

const sceneOf = (path: string): Scene =>
  path === "/" ? "home" : path.startsWith("/about") ? "about" : path.startsWith("/projects/") ? "project" : null;

/**
 * In the root layout: tells the player which page we are on, and shows the SOUND button.
 * The site always starts silent; turning sound on plays "Game Start", then the page's music.
 */
export default function Music() {
  const path = usePathname();
  useEffect(() => { music.setScene(sceneOf(path)); }, [path]);
  const on = useSyncExternalStore(music.subscribe, music.isOn, () => false);
  return (
    <button type="button" className="sound" data-on={on} onClick={() => music.toggle()} aria-pressed={on} aria-label={on ? "Sound on. Turn sound off" : "Sound off. Turn sound on"}>
      <span className="sound__bars" aria-hidden="true"><i /><i /><i /><i /></span>
      Sound {on ? "on" : "off"}
    </button>
  );
}
