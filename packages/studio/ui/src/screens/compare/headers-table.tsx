import { TONE_DIM, TONE_TEXT } from "@/design/tone";
import type { HeaderChange, HeaderRow } from "@/features/compare/header-diff";
import { cn } from "@/lib/utils";
import type { Side } from "./side-tag";
import { sideText } from "./side-tag";

const CHANGE_TONE: Readonly<Record<HeaderChange, "ok" | "err" | "warn" | "muted">> = {
  added: "ok",
  removed: "err",
  changed: "warn",
  same: "muted",
};

/* In a table too narrow for four columns, the name and its change share the first line and each
   side's value takes a line of its own, after its letter. */
const GRID =
  "grid grid-cols-[minmax(120px,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_70px] gap-3 px-4 @max-[35rem]:grid-cols-[minmax(0,1fr)_auto] @max-[35rem]:gap-y-1";
const VALUE = "break-all @max-[35rem]:col-span-2";

function SideLetter({ side }: { side: Side }): React.ReactNode {
  return (
    <span className={cn("mr-2 hidden font-sans font-bold @max-[35rem]:inline", sideText(side))}>
      {side.toUpperCase()}
    </span>
  );
}

/**
 * The two responses' headers side by side: each by name with its value on
 * A and on B, and whether it was added, removed, changed or stayed. In a
 * table too narrow for the four columns, each header's values go on lines
 * of their own under its name, each after its side's letter.
 *
 * @param props - The headers
 * @returns The table
 * @example
 * ```tsx
 * <HeadersTable rows={headerDiff(a.headers, b.headers)} />
 * ```
 */
export function HeadersTable({ rows }: { rows: readonly HeaderRow[] }): React.ReactNode {
  return (
    <section
      aria-label="Headers"
      className="@container overflow-hidden rounded-sheet border border-line bg-panel"
    >
      <div
        className={cn(
          GRID,
          "h-8.5 items-center border-b border-line bg-panel-subtle text-label text-fg-subtle @max-[35rem]:hidden",
        )}
      >
        <span>Header</span>
        <span>A</span>
        <span>B</span>
        <span className="text-right">Change</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.name}
          className={cn(
            GRID,
            "min-h-9 items-center border-b border-line py-1.5 font-mono text-label last:border-b-0 @max-[35rem]:py-2.5",
            row.change !== "same" && "bg-bg-subtle",
          )}
        >
          <span className="break-all text-syntax-function">{row.name}</span>
          <span
            className={cn(
              VALUE,
              row.change === "removed" || row.change === "changed" ? "text-err" : "text-fg-muted",
            )}
          >
            <SideLetter side="a" />
            {row.a ?? "—"}
          </span>
          <span
            className={cn(
              VALUE,
              row.change === "added" || row.change === "changed" ? "text-ok" : "text-fg-muted",
            )}
          >
            <SideLetter side="b" />
            {row.b ?? "—"}
          </span>
          <span
            className={cn(
              "flex h-4.75 items-center justify-self-end rounded-chip px-1.5 font-sans text-meta font-strong @max-[35rem]:col-start-2 @max-[35rem]:row-start-1",
              TONE_TEXT[CHANGE_TONE[row.change]],
              TONE_DIM[CHANGE_TONE[row.change]],
            )}
          >
            {row.change}
          </span>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="m-0 px-4 py-6 text-center text-small text-fg-subtle">
          Neither response has headers Studio saw
        </p>
      )}
    </section>
  );
}
