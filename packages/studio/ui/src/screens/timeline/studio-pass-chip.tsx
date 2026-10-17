/* What the chip says on hover. */
const TITLE =
  "browsersOnly let this Playground call through on the one-time pass Studio's runtime gave it; a call that says nothing of where it comes from is still refused";

/**
 * The mark of a Playground call `browsersOnly` let through only on the
 * one-time pass Studio's runtime gave it: `studio pass`, and on hover why.
 *
 * @returns The chip
 * @example
 * ```tsx
 * {r.studioPass && <StudioPassChip />}
 * ```
 */
export function StudioPassChip(): React.ReactNode {
  return (
    <span
      title={TITLE}
      className="shrink-0 rounded-chip bg-raised px-1.5 py-px font-sans text-meta text-fg-muted"
    >
      studio pass
    </span>
  );
}
