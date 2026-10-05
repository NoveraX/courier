import { Check } from "lucide-react"

import { cn } from "@/site/cn"

/** A cell: its text, and whether it is the column or answer to notice. */
type Cell = string | { label: string; highlight?: boolean | undefined }

function labelOf(cell: Cell): string {
  return typeof cell === "string" ? cell : cell.label
}

function isHighlighted(cell: Cell): boolean {
  return typeof cell !== "string" && cell.highlight === true
}

/**
 * Options compared side by side — Courier against the alternatives, one
 * mode against the other — with the answers worth noticing marked.
 *
 * @param props - The column headings and the rows
 * @returns The table
 * @example
 * ```tsx
 * <ComparisonTable headers={["Feature", { label: "Courier", highlight: true }]} rows={[["Types", { label: "Full", highlight: true }]]} />
 * ```
 */
export function ComparisonTable({
  headers,
  rows,
}: {
  headers: readonly Cell[]
  rows: readonly (readonly Cell[])[]
}) {
  return (
    <div className="my-6 overflow-x-auto rounded-panel border border-line bg-panel shadow-panel">
      <table className="w-full border-collapse text-left text-control">
        <thead className="bg-bg-subtle">
          <tr>
            {headers.map((cell) => (
              <th
                key={labelOf(cell)}
                scope="col"
                className={cn(
                  "border-b border-line px-4 py-2.5 font-medium whitespace-nowrap",
                  isHighlighted(cell) ? "text-brand" : "text-fg-subtle"
                )}
              >
                {labelOf(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.map(labelOf).join("|")} className="border-b border-line last:border-b-0">
              {row.map((cell, i) => {
                const Tag = i === 0 ? "th" : "td"
                return (
                  <Tag
                    // biome-ignore lint/suspicious/noArrayIndexKey: a row repeats answers ("Yes"); a cell's column is its identity
                    key={`${i}-${labelOf(cell)}`}
                    scope={i === 0 ? "row" : undefined}
                    className={cn(
                      "px-4 py-2.5 align-top",
                      i === 0 ? "font-medium text-fg" : "text-fg-muted",
                      isHighlighted(cell) && "text-fg"
                    )}
                  >
                    <span className="inline-flex items-start gap-1.5">
                      {isHighlighted(cell) && (
                        <Check aria-hidden="true" className="mt-0.75 size-3.25 shrink-0 text-ok" />
                      )}
                      {labelOf(cell)}
                    </span>
                  </Tag>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
