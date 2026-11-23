import { pixelKCells } from "@/lib/pixelK";

const K = pixelKCells();

/** The K logo: arcade pixels, yellow with a black outline and drop shadow. */
export default function KLogo({ className = "k-logo", title }: { className?: string; title?: string }) {
  const rects = (cells: [number, number][]) => cells.map(([x, y]) => `M${x - 1} ${y - 1}h1v1h-1z`).join("");
  return (
    <svg className={className} viewBox={`-1 -1 ${K.w} ${K.h}`} shapeRendering="crispEdges" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d={rects(K.ink)} fill="#111" />
      <path d={rects(K.fill)} fill="#ffd21f" />
    </svg>
  );
}
