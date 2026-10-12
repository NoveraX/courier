import { cn } from "@/site/cn"
import { REFACTOR_TABS } from "./refactor-code"
import type { RefactorFrame } from "./refactor-frame"

interface RefactorTabsProps {
  frame: RefactorFrame
  /** The change so far, and its colour. */
  diff: { label: string; tone: string }
}

/**
 * The refactor's files as tabs: the page stays, the route and the query
 * keys close once their code is gone.
 *
 * @param props - The frame, and the change so far
 * @returns The tab bar
 * @example
 * ```tsx
 * <RefactorTabs frame={frame} diff={{ label: "−12", tone: "text-tone-red" }} />
 * ```
 */
export function RefactorTabs({ frame, diff }: RefactorTabsProps) {
  return (
    <div className="flex h-10 items-stretch overflow-hidden border-b border-line bg-bg-subtle">
      {REFACTOR_TABS.map((name, at) => {
        const tab = frame.tabs[at]
        return (
          <div
            key={name}
            aria-hidden={tab?.closed}
            className={cn(
              "flex items-center gap-2 overflow-hidden border-r font-mono text-[11.5px] tracking-normal whitespace-nowrap transition-[max-width,opacity,padding] duration-500 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none",
              tab?.closed
                ? "max-w-0 border-transparent px-0 opacity-0"
                : "max-w-65 border-line px-3.5 opacity-100",
              at === 0 && "bg-panel",
              tab?.active ? "text-fg" : "text-fg-subtle"
            )}
          >
            <span className="min-w-0 truncate">{name}</span>
          </div>
        )
      })}
      <div
        className={cn(
          "ml-auto flex items-center px-3.5 font-mono text-micro tracking-normal whitespace-nowrap",
          diff.tone
        )}
      >
        {diff.label}
      </div>
    </div>
  )
}
