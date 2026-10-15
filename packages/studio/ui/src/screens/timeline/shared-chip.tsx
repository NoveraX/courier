import type { SharedAnswer } from "@/store/types";

const TITLE: Readonly<Record<SharedAnswer["by"], string>> = {
  flight:
    "Joined the identical read already in flight: that call's request answered it, and it sent none of its own",
  render: "This render had read it already: that read's answer came back, and it sent no request",
};

/**
 * The mark of a call whose read another call's request answered, with no
 * request of its own: `shared`, and on hover how it was answered.
 *
 * @param props - How the call's read was shared
 * @returns The chip
 * @example
 * ```tsx
 * {r.shared && <SharedChip shared={r.shared} />}
 * ```
 */
export function SharedChip({ shared }: { shared: SharedAnswer }): React.ReactNode {
  return (
    <span
      title={TITLE[shared.by]}
      className="shrink-0 rounded-chip bg-raised px-1.5 py-px font-sans text-meta text-fg-muted"
    >
      shared
    </span>
  );
}
