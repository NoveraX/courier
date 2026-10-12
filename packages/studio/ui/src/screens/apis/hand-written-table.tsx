import { Link } from "@tanstack/react-router";
import { FileCode2 } from "lucide-react";

import type { HandWrittenRow } from "@/features/apis/api-card-view";
import { cn } from "@/lib/utils";

/* In a table narrower than 560px, where lists stack, a row gives its name, its figures
   and its file a line each. */
const COLUMNS =
  "grid-cols-[minmax(0,1fr)_70px_60px_120px] min-[1140px]:grid-cols-[minmax(0,1.4fr)_80px_70px_minmax(120px,1fr)_minmax(0,1.2fr)] @max-[560px]:grid-cols-[auto_auto_minmax(0,1fr)]";

/* Read out with each figure, as the table's head is not; shown beside it once a row stacks. */
const UNIT = "sr-only @max-[560px]:not-sr-only";

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

/**
 * The sources written by hand in the project: each with its endpoints and
 * groups, how many have a typed response, and its file — opening its
 * endpoints in the Explorer. In a narrow table, as on a phone, a source's
 * name, its figures — each saying what it counts — and its file take a
 * line each.
 *
 * @param props - The rows
 * @returns The table
 * @example
 * ```tsx
 * <HandWrittenTable rows={handWritten.map(handWrittenRow)} />
 * ```
 */
export function HandWrittenTable({ rows }: { rows: readonly HandWrittenRow[] }): React.ReactNode {
  return (
    <section
      aria-label="Hand-written sources"
      className="@container overflow-hidden rounded-sheet border border-line bg-panel"
    >
      <div
        aria-hidden="true"
        className={cn(
          "grid h-8.5 items-center gap-3 border-b border-line bg-panel-subtle px-4 text-label text-fg-subtle @max-[560px]:hidden",
          COLUMNS,
        )}
      >
        <span>Source</span>
        <span className="text-right">Endpoints</span>
        <span className="text-right">Groups</span>
        <span>Typed</span>
        <span className="hidden min-[1140px]:block">File</span>
      </div>
      {rows.map((row) => (
        <Link
          key={row.name}
          to="/explorer/endpoints"
          search={{ q: `${row.name}.` }}
          className={cn(
            "grid h-10.5 items-center gap-3 border-b border-line px-4 last:border-b-0 hover:bg-raised @max-[560px]:h-auto @max-[560px]:gap-y-1.5 @max-[560px]:py-2.5",
            COLUMNS,
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5 @max-[560px]:col-span-full">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-raised text-fg-subtle">
              <FileCode2 aria-hidden="true" className="size-3" />
            </span>
            <span className="truncate font-mono text-control">{row.name}</span>
          </span>
          <span className="text-right font-mono text-small text-fg-muted @max-[560px]:pl-8.5 @max-[560px]:text-left">
            {row.endpoints}
            <span className={cn(UNIT, "font-sans")}> {plural(row.endpoints, "endpoint")}</span>
          </span>
          <span className="text-right font-mono text-small text-fg-muted @max-[560px]:text-left">
            {row.groups}
            <span className={cn(UNIT, "font-sans")}> {plural(row.groups, "group")}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1 max-w-22.5 flex-1 overflow-hidden rounded-full bg-raised">
              <span
                className={cn("block h-full", row.typed === row.endpoints ? "bg-ok" : "bg-warn")}
                style={{ width: `${row.endpoints ? (row.typed / row.endpoints) * 100 : 0}%` }}
              />
            </span>
            <span className="font-mono text-badge whitespace-nowrap text-fg-subtle">
              {`${row.typed}/${row.endpoints}`}
              <span className="sr-only font-sans @max-[560px]:not-sr-only"> typed</span>
            </span>
          </span>
          <span className="hidden truncate font-mono text-badge text-fg-subtle min-[1140px]:block @max-[560px]:col-span-full @max-[560px]:block @max-[560px]:pl-8.5">
            {row.file}
          </span>
        </Link>
      ))}
    </section>
  );
}
