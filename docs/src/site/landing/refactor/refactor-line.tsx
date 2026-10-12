import { memo } from "react"

import { cn } from "@/site/cn"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { TokenLine } from "@/site/code/token-line"
import { OLD_LINES } from "./refactor-code"
import type { LineState } from "./refactor-frame"

interface RefactorLineProps {
  /** Which line it is: the hand-written ones first, then the new ones. */
  at: number
  state: LineState
  lineHeight: number
  tokens: readonly CodeToken[]
}

const ROW: Readonly<Record<LineState, string>> = {
  kept: "opacity-100",
  struck: "bg-tone-red/8 opacity-72",
  gone: "opacity-0",
  hidden: "opacity-0",
  added: "bg-ok/7 opacity-100",
}

function sign(state: LineState, at: number): string {
  if (state === "struck" || state === "gone") return "−"
  if (state === "added") return "+"
  return at < OLD_LINES.length && state === "kept" ? String(at + 1) : ""
}

/**
 * One line of the refactor's code as it stands: kept with its number,
 * struck through, gone, or added. As the reader scrolls only the lines
 * whose state changes render again, not all twenty-three.
 *
 * @param props - Which line, where it stands, its height and its runs
 * @returns The line
 * @example
 * ```tsx
 * <RefactorLine at={0} state="struck" lineHeight={23} tokens={lines[0]} />
 * ```
 */
export const RefactorLine = memo(function RefactorLine({
  at,
  state,
  lineHeight,
  tokens,
}: RefactorLineProps) {
  const shown = state !== "gone" && state !== "hidden"
  const struck = state === "struck" || state === "gone"
  return (
    <div
      aria-hidden={!shown}
      className={cn(
        "flex overflow-hidden transition-[height,opacity,background-color] duration-450 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none",
        ROW[state]
      )}
      style={{ height: shown ? `${lineHeight}px` : "0px", lineHeight: `${lineHeight}px` }}
    >
      <span
        className={cn(
          "w-8.5 shrink-0 text-center select-none",
          struck ? "text-tone-red" : state === "added" ? "text-ok" : "text-fg-subtle"
        )}
      >
        {sign(state, at)}
      </span>
      <span
        className={cn(
          "pr-5 whitespace-pre decoration-[1.5px] transition-[text-decoration-color,color] duration-300 motion-reduce:transition-none",
          struck ? "text-fg-subtle line-through decoration-tone-red/85 [&_span]:text-fg-subtle" : ""
        )}
      >
        <TokenLine tokens={tokens} />
      </span>
    </div>
  )
})
