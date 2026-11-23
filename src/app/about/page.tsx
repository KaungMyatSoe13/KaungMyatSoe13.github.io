import type { Metadata } from "next";
import { site } from "@/content/site";
import AboutStory from "@/components/AboutStory";

export const metadata: Metadata = {
  title: `About · ${site.name}`,
  description: `${site.name}, ${site.role}: education, what I work on, and how to reach me.`,
};

export default function AboutPage() {
  return <AboutStory />;
}
