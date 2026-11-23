import type { Metadata } from "next";
import InkHero from "@/components/InkHero";
import ProjectList from "@/components/ProjectList";

// The previous home page (staircase particle names), kept for reference. Not linked.
export const metadata: Metadata = { title: "Lab · staircase list", robots: { index: false } };

export default function LabPage() {
  return (
    <main>
      <InkHero />
      <ProjectList />
    </main>
  );
}
