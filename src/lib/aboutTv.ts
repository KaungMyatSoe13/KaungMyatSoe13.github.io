/** What the Contact screen shows: the message being typed, or the state of the send. */
export type TvScreen = { name: string; msg: string; state: "idle" | "sending" | "sent" };

/**
 * The About page's one TV (`AboutTv`) and the rest of the page talk through this.
 * The TV writes where its screen's picture corners are on the viewport, so the portrait
 * particles can draw the "What I do" icons on it; Contact writes what to show once it lands.
 */
export const aboutTv = {
  /** False until the TV has placed itself (the particles fall back to a plain box). */
  ready: false,
  /** Picture corners in viewport px: top-left, top-right, bottom-right, bottom-left (x, y each). */
  px: new Float32Array(8),
  screen: { name: "", msg: "", state: "idle" } as TvScreen,
};
