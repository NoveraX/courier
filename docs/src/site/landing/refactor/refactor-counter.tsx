import { cn } from "@/site/cn"
import { OLD_LINES } from "./refactor-code"

interface RefactorCounterProps {
  struck: number
  filesLeft: number
  linesLeft: number
  /** The bar and what is left under the count rather than beside it, in a narrow column. */
  stacked?: boolean
}

/**
 * How much the refactor has deleted: the lines gone, a bar from red to
 * green, and what is left — beside the count, or under it in a narrow
 * column.
 *
 * @param props - The lines struck, the files and lines left, and whether they stack
 * @returns The counter
 * @example
 * ```tsx
 * <RefactorCounter struck={12} filesLeft={3} linesLeft={8} />
 * ```
 */
export function RefactorCounter({
  struck,
  filesLeft,
  linesLeft,
  stacked = false,
}: RefactorCounterProps) {
  return (
    <div
      className={cn(
        "flex gap-4.5 min-[980px]:mt-5.5",
        stacked ? "flex-col items-stretch gap-3" : "items-center"
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[clamp(34px,4.2vw,50px)] leading-none font-medium tracking-[-0.04em] text-ok tabular-nums">
          −{struck}
        </span>
        <span className="text-control text-fg-muted">lines</span>
      </div>
      <div className={cn("min-w-0", !stacked && "flex-1")}>
        <div className="h-1 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-tone-red),var(--color-ok))] shadow-[0_0_12px_rgb(94_211_163/0.5)] transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${Math.round((struck / OLD_LINES.length) * 100)}%` }}
          />
        </div>
        <p className="m-0 mt-2 font-mono text-micro tracking-normal text-fg-subtle">
          {filesLeft} {filesLeft === 1 ? "file" : "files"} · {linesLeft} lines left
        </p>
      </div>
    </div>
  )
}
