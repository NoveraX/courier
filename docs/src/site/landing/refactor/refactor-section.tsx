"use client"

import { Scissors } from "lucide-react"
import { cn } from "@/site/cn"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { useElementHeight } from "@/site/landing/use-element-height"
import { useSmallViewport } from "@/site/landing/use-small-viewport"
import { RefactorCounter } from "./refactor-counter"
import { RefactorEditor } from "./refactor-editor"
import { refactorFrame, refactorStop } from "./refactor-frame"
import { codeLineHeight } from "./refactor-layout"
import { RefactorSteps } from "./refactor-steps"
import { useScrollProgress } from "./use-scroll-progress"

const TITLE = "The code you get to delete"

function Eyebrow() {
  return (
    <p className="m-0 mb-3.5 flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] text-tone-red">
      <Scissors aria-hidden="true" className="size-3.25" />
      SCROLL TO REFACTOR
    </p>
  )
}

/**
 * What Courier replaces, deleted as the reader scrolls: a call written by
 * hand — the fetch, a proxy route, query keys — struck chunk by chunk and
 * replaced by three typed lines, with the steps and the count beside it.
 * The stage holds still below the header while the section scrolls past.
 *
 * @param props - The hand-written lines, then the new ones, highlighted
 * @returns The section, with its heading above it on a narrow screen
 * @example
 * ```tsx
 * <RefactorSection lines={lines} />
 * ```
 */
export function RefactorSection({ lines }: { lines: readonly CodeToken[][] }) {
  const room = useSmallViewport()
  const [sectionRef, progress] = useScrollProgress<HTMLElement>({
    height: room.height,
    snap: refactorStop,
  })
  const [narrativeRef, narrative] = useElementHeight<HTMLDivElement>()
  const frame = refactorFrame(progress)
  const lineHeight = codeLineHeight({ ...room, narrative: narrative || 90 })
  return (
    <>
      <div className="mx-auto mt-28 max-w-[1200px] px-5 min-[980px]:hidden">
        <Eyebrow />
        <h2 className="m-0 max-w-[16ch] text-[clamp(26px,6vw,36px)] leading-[1.06] font-semibold tracking-[-0.035em]">
          {TITLE}
        </h2>
      </div>
      <section
        id="delete"
        ref={sectionRef}
        aria-label={TITLE}
        className="relative mt-4 h-[260vh] overflow-x-clip min-[980px]:mt-28"
      >
        <div className="sticky top-14 pb-7">
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 transition-opacity duration-600 motion-reduce:transition-none",
              "bg-[radial-gradient(50%_60%_at_70%_45%,rgb(240_128_106/0.06),transparent_70%)]",
              frame.done && "opacity-0"
            )}
          />
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_70%_45%,rgb(94_211_163/0.09),transparent_70%)] transition-opacity duration-600 motion-reduce:transition-none",
              !frame.done && "opacity-0"
            )}
          />
          <div className="relative mx-auto max-w-[1200px] px-5 pt-[clamp(16px,3svh,32px)]">
            <div className="grid grid-cols-1 items-start gap-4.5 min-[980px]:grid-cols-[minmax(0,380px)_minmax(0,1fr)] min-[980px]:gap-14">
              <div ref={narrativeRef} className="min-w-0">
                <div className="hidden min-[980px]:block">
                  <Eyebrow />
                  <h2 className="m-0 max-w-[14ch] text-[clamp(26px,3.3vw,42px)] leading-[1.06] font-semibold tracking-[-0.035em]">
                    {TITLE}
                  </h2>
                  <p className="m-0 mt-3.5 max-w-[40ch] text-[15.5px] leading-[1.6] text-fg-muted">
                    Keep scrolling. This is what one typed, proxied, cache-aware call costs today —
                    and what is left once Courier owns it.
                  </p>
                  <RefactorSteps states={frame.steps} />
                </div>
                <RefactorCounter
                  struck={frame.struck}
                  filesLeft={frame.filesLeft}
                  linesLeft={frame.linesLeft}
                />
              </div>
              <RefactorEditor frame={frame} lineHeight={lineHeight} lines={lines} />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
