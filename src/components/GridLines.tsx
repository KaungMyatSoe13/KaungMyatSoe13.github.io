/**
 * The 12-column background grid with a column number at every horizontal line
 * (01–12 repeated on each row), shared by the landing, the lab list and project pages.
 */
const ROWS = 8; // enough rows to cover a tall screen

export default function GridLines({ className = "" }: { className?: string }) {
  return (
    <div className={`work-grid ${className}`} aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i}>
          {Array.from({ length: ROWS }, (_, r) => (
            <i key={r} style={{ ["--r" as string]: r }}>
              {String(i + 1).padStart(2, "0")}
            </i>
          ))}
        </span>
      ))}
    </div>
  );
}
