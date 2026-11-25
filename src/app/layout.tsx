import type { Metadata, Viewport } from "next";
import { Doto, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { site } from "@/content/site";
import Cursor from "@/components/Cursor";
import TransitionLayer from "@/components/TransitionLayer";
import SmoothScroll from "@/components/SmoothScroll";
import Music from "@/components/Music";
import Loader from "@/components/Loader";
import AskK from "@/components/AskK";
import "./globals.css";

const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const dot = Doto({ subsets: ["latin"], weight: ["500", "700", "800", "900"], variable: "--font-dot", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: `${site.name} · ${site.role}`,
  description: `${site.role} in ${site.location}. ${site.intro}`,
  openGraph: {
    title: `${site.name} · ${site.role}`,
    description: site.intro,
    url: site.url,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0e0e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. Grammarly) add attributes to <html>
    // and <body> before React loads; this only ignores attribute differences on these two tags
    <html lang="en" className={`${sans.variable} ${mono.variable} ${dot.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <a className="skip" href="#work">
          Skip to projects
        </a>
        {children}
        <TransitionLayer />
        <Cursor />
        <SmoothScroll />
        <Music />
        <AskK />
        <Loader />
      </body>
    </html>
  );
}
