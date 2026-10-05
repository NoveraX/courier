import { cn } from "@/site/cn"
import { BrandIcon } from "@/site/landing/brand-icon"
import { PageLink } from "@/site/landing/page-link"
import type { ShownAdapter } from "./adapter-picker"
import { ADAPTERS_OVERVIEW } from "./adapters"

interface AdapterListProps {
  adapters: readonly ShownAdapter[]
  picked: number
  /** The turn the list is on while it moves by itself, or `null` while it stands still. */
  turn: number | null
  running: boolean
  /** How many official adapters there are in all. */
  total: number
  onPick: (at: number) => void
}

/* One mark for the adapter shown: a bar along the list's outer edge — under the tab
   while the list scrolls across, beside it once it stands in a column. While the list
   moves by itself, the same bar fills as the turn runs out. */
const MARK =
  "absolute inset-x-0 bottom-0 h-0.5 bg-fg min-[900px]:inset-x-auto min-[900px]:inset-y-0 min-[900px]:left-0 min-[900px]:h-auto min-[900px]:w-0.5"
const FILLING =
  "origin-left animate-fill will-change-transform min-[900px]:origin-top min-[900px]:animate-fill-y"

/**
 * The adapters to pick from, one under another beside the code — or across,
 * on a narrow screen — and a link to every official adapter on the overview.
 *
 * @param props - The adapters shown, the one picked, the turn and whether it runs, how many there are, and what a pick does
 * @returns The list
 * @example
 * ```tsx
 * <AdapterList adapters={adapters} picked={0} turn={null} running={false} total={10} onPick={pick} />
 * ```
 */
export function AdapterList({ adapters, picked, turn, running, total, onPick }: AdapterListProps) {
  return (
    <fieldset className="m-0 flex min-w-0 overflow-x-auto border-0 p-0 [scrollbar-width:none] min-[900px]:flex-col min-[900px]:overflow-visible">
      <legend className="sr-only">Adapters</legend>
      {adapters.map((item, at) => {
        const on = at === picked
        return (
          <button
            key={item.label}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(at)}
            className={cn(
              "relative flex h-12 shrink-0 cursor-pointer items-center gap-3 border-r border-line px-4 text-left whitespace-nowrap transition-colors duration-200 hover:bg-panel min-[900px]:border-r-0 min-[900px]:border-b",
              on ? "bg-panel" : "bg-transparent"
            )}
          >
            {on && (
              <span
                key={turn ?? "still"}
                aria-hidden="true"
                className={cn(MARK, turn !== null && FILLING)}
                style={
                  turn === null ? undefined : { animationPlayState: running ? "running" : "paused" }
                }
              />
            )}
            <span
              className={cn(
                "text-fg transition-opacity duration-200",
                on ? "opacity-100" : "opacity-42"
              )}
            >
              <BrandIcon path={item.icon} className="block size-4.5" />
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 text-[14px] tracking-[-0.015em]",
                on ? "text-fg" : "text-fg-muted"
              )}
            >
              {item.label}
            </span>
          </button>
        )
      })}
      <PageLink
        href={ADAPTERS_OVERVIEW}
        className="flex h-12 shrink-0 items-center gap-2 px-4 text-[13.5px] whitespace-nowrap text-fg-muted transition-colors hover:text-fg"
      >
        All {total} adapters
        <span aria-hidden="true">→</span>
      </PageLink>
    </fieldset>
  )
}
