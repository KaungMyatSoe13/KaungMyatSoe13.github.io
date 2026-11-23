import type { Metadata } from "next";
import JapaneseRoom from "@/components/JapaneseRoom";

// Renders only the CSS 3D room, to snapshot it as a background image
// (public/projects/kotobalab/room.webp). Not linked.
export const metadata: Metadata = { title: "Lab · room", robots: { index: false } };

export default function RoomPage() {
  return (
    <main className="detail" style={{ ["--mx" as string]: 0, ["--my" as string]: 0 }}>
      <JapaneseRoom />
    </main>
  );
}
