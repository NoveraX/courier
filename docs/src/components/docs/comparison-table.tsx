import { cn } from "@/lib/utils"

type Cell = string | { label: string; highlight?: boolean }

interface ComparisonTableProps {
  headers: Cell[]
  rows: Cell[][]
}

function getCellLabel(cell: Cell): string {
  return typeof cell === "string" ? cell : cell.label
}

function isCellHighlighted(cell: Cell): boolean {
  return typeof cell === "object" && cell.highlight === true
}

export function ComparisonTable({ headers, rows }: ComparisonTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {headers.map((header, i) => (
              <th
                key={getCellLabel(header)}
                className={cn("py-3 font-semibold", i === 0 ? "pr-4" : "px-4")}
                style={isCellHighlighted(header) ? { color: "var(--color-brand)" } : undefined}
              >
                {getCellLabel(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={cn(rowIdx < rows.length - 1 && "border-b border-border/50")}
            >
              {row.map((cell, colIdx) => (
                <td
                  key={colIdx}
                  className={cn("py-3", colIdx === 0 ? "pr-4 font-medium" : "px-4")}
                  style={{
                    color: isCellHighlighted(cell)
                      ? "var(--color-success)"
                      : colIdx === 0
                        ? "var(--color-foreground)"
                        : undefined,
                  }}
                >
                  {getCellLabel(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
