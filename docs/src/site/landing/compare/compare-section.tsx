import { cn } from "@/site/cn"
import { COMPARE_ROWS, COMPARED } from "./compare-data"
import { CompareHead } from "./compare-head"
import { CoverageBadge, CoverageLegend } from "./coverage-badge"

const LAST = COMPARE_ROWS.length - 1
const MINE = COMPARED.length - 1

/**
 * Where Courier sits: the needs every API layer has, and how fetch, axios,
 * tRPC and Courier meet each one, Courier's column outlined.
 *
 * @returns The section
 * @example
 * ```tsx
 * <CompareSection />
 * ```
 */
export function CompareSection() {
  return (
    <section id="compare" className="pt-28">
      <div className="mx-auto max-w-[1200px] px-5">
        <div className="mb-7.5 grid grid-cols-1 items-end gap-4.5 min-[900px]:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <h2 className="m-0 animate-rise text-[clamp(27px,3.3vw,40px)] leading-[1.08] font-semibold tracking-[-0.035em]">
              Where it sits
            </h2>
            <p className="mt-3.5 mb-0 max-w-[54ch] animate-rise text-[16px] leading-[1.6] text-fg-muted">
              Full inference like tRPC — but against a REST backend you do not control.
            </p>
          </div>
          <CoverageLegend />
        </div>
        <div className="overflow-hidden rounded-[14px] border border-line bg-panel">
          <div className="overflow-x-auto px-3">
            <table className="w-full min-w-[756px] table-fixed border-separate border-spacing-0">
              <caption className="sr-only">Courier compared with fetch, axios and tRPC</caption>
              <colgroup>
                <col className="w-[27%]" />
                {COMPARED.map((name) => (
                  <col key={name} />
                ))}
              </colgroup>
              <thead>
                <CompareHead />
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, at) => (
                  <tr key={row.need} className="group">
                    <th
                      scope="row"
                      className="border-t border-line px-2 py-3.5 text-left font-normal group-hover:bg-bg-subtle"
                    >
                      <span className="flex items-center gap-2.75">
                        <span className="grid size-7 shrink-0 place-items-center rounded-control border border-line bg-bg-subtle text-fg-muted">
                          <row.icon aria-hidden="true" className="size-3.5" />
                        </span>
                        <span className="text-[14px] tracking-[-0.01em] text-fg">{row.need}</span>
                      </span>
                    </th>
                    {row.cells.map((cell, column) => {
                      const me = column === MINE
                      return (
                        <td
                          key={COMPARED[column]}
                          className={cn(
                            "border-t border-line p-3.5 group-hover:bg-bg-subtle",
                            me && "border-x border-x-brand/30 bg-brand/6 group-hover:bg-brand/6",
                            me && at === LAST && "rounded-b-[12px] border-b border-b-brand/30"
                          )}
                        >
                          <span className="flex items-center gap-2.25">
                            <CoverageBadge coverage={cell.coverage} />
                            <span
                              className={cn(
                                "text-control leading-[1.35]",
                                me
                                  ? "font-medium text-fg"
                                  : cell.coverage === "no"
                                    ? "text-fg-subtle"
                                    : "text-fg-muted"
                              )}
                            >
                              {cell.text}
                            </span>
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="h-3" />
          </div>
        </div>
      </div>
    </section>
  )
}
