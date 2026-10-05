import { CODE_TONES } from "@/design/code/code-lines";
import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import type { DiffLine, DiffRow } from "@/features/compare/diff-rows";
import { cn } from "@/lib/utils";
import type { Side } from "./side-tag";
import { SideTag } from "./side-tag";

/* Where a side has no line, the row is hatched so the two columns stay aligned. */
const HATCH = "bg-[repeating-linear-gradient(135deg,var(--color-line)_0_1px,transparent_1px_6px)]";

function marked(row: DiffRow, side: Side): boolean {
  if (row.kind === "changed") return true;
  return side === "a" ? row.kind === "removed" : row.kind === "added";
}

function Line({ row, side }: { row: DiffRow; side: Side }): React.ReactNode {
  const line: DiffLine | null = side === "a" ? row.a : row.b;
  if (!line)
    return (
      <div aria-hidden="true" className={cn("flex min-h-5 whitespace-pre", HATCH)}>
        {" "}
      </div>
    );
  const mark = marked(row, side);
  return (
    <div className={cn("flex min-h-5", mark && (side === "a" ? "bg-err-dim" : "bg-ok-dim"))}>
      <span className="w-9.5 shrink-0 pr-1.5 text-right text-fg-subtle opacity-50 select-none">
        {line.n}
      </span>
      <span
        className={cn(
          "w-4 shrink-0 text-center select-none",
          side === "a" ? "text-err" : "text-ok",
        )}
      >
        {mark ? (side === "a" ? "−" : "+") : ""}
      </span>
      <span className="pr-3 whitespace-pre">
        {tokenizeJsonLine(line.text).map((token, at) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of a fixed line, in order
          <span key={at} className={CODE_TONES[token.tone]}>
            {token.text}
          </span>
        ))}
      </span>
    </div>
  );
}

interface DiffViewProps {
  rows: readonly DiffRow[];
  /** What each column is headed with after its tag: the call, or "Variables". */
  titles: Readonly<Record<Side, string>>;
}

/**
 * Two texts side by side, line against line: what A had and B did not in
 * red, what B gained in green, a changed line on one row, the side that
 * lacks a line hatched.
 *
 * @param props - The rows, and what heads each column
 * @returns The diff
 * @example
 * ```tsx
 * <DiffView rows={diffRows(lineDiff(a, b), false)} titles={{ a: "A · 14:02:11", b: "B · 14:02:41" }} />
 * ```
 */
export function DiffView({ rows, titles }: DiffViewProps): React.ReactNode {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-sheet border border-line bg-inset">
      {(["a", "b"] as const).map((side) => (
        <div key={side} className="min-w-0 border-line first:border-r">
          <div className="flex h-9 items-center gap-2 border-b border-line bg-panel-subtle px-3.5">
            <SideTag side={side} />
            <span className="truncate text-small text-fg-muted">{titles[side]}</span>
          </div>
          <pre className="m-0 overflow-x-auto pt-2 pb-3 font-mono text-small leading-[1.7]">
            {rows.map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a diff's rows are fixed; the place is the row's identity
              <Line key={i} row={row} side={side} />
            ))}
            {rows.length === 0 && <div className="px-4 text-fg-subtle">Nothing to show</div>}
          </pre>
        </div>
      ))}
    </div>
  );
}
