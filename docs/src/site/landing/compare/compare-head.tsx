import { Globe } from "lucide-react"
import type { ReactNode } from "react"
import { siAxios, siTrpc } from "simple-icons"

import { cn } from "@/site/cn"
import { CourierMark } from "@/site/courier-mark"
import { BrandIcon } from "@/site/landing/brand-icon"
import { COMPARED, scoreOf } from "./compare-data"

const MARKS: readonly ReactNode[] = [
  <Globe key="fetch" aria-hidden="true" className="size-3.5" />,
  <BrandIcon key="axios" path={siAxios.path} className="size-3.5" />,
  <BrandIcon key="trpc" path={siTrpc.path} className="size-3.5" />,
  <CourierMark key="courier" width={14} />,
]

/**
 * The comparison's header row: each tool with its mark and its score,
 * Courier's column raised and outlined in the accent.
 *
 * @returns The row
 * @example
 * ```tsx
 * <thead><CompareHead /></thead>
 * ```
 */
export function CompareHead() {
  return (
    <tr>
      <th
        scope="col"
        className="px-2 pt-4.5 pb-4 text-left align-bottom font-mono text-micro font-normal tracking-[0.08em] text-fg-subtle"
      >
        FEATURE
      </th>
      {COMPARED.map((name, column) => {
        const me = column === COMPARED.length - 1
        return (
          <th key={name} scope="col" className="p-0 text-left align-bottom font-normal">
            <div
              className={cn(
                "flex items-center gap-2.25 px-3.5 pt-4.5 pb-4",
                me &&
                  "mt-2 rounded-t-[12px] border border-b-0 border-brand/30 bg-brand/6 shadow-[inset_0_2px_0_var(--color-brand)]"
              )}
            >
              <span
                className={cn(
                  "grid size-6.5 shrink-0 place-items-center rounded-[7px] border border-line",
                  me ? "bg-brand/14 text-brand" : "bg-bg-subtle text-fg-muted"
                )}
              >
                {MARKS[column]}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={cn(
                    "text-[14px] tracking-[-0.015em]",
                    me ? "font-semibold text-fg" : "font-medium text-fg-muted"
                  )}
                >
                  {name}
                </span>
                <span className="font-mono text-micro tracking-normal text-fg-subtle">
                  {scoreOf(column)}
                </span>
              </span>
            </div>
          </th>
        )
      })}
    </tr>
  )
}
