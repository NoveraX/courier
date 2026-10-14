"use client"

import { cn } from "@/site/cn"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { sliceTokens } from "@/site/code/highlight-tokens"
import { TokenLine } from "@/site/code/token-line"
import { useInView } from "@/site/landing/use-in-view"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"
import { CompletionPopup } from "./completion-popup"
import type { HeroFrame } from "./hero-frame"
import { HERO_CYCLE, HERO_REST, heroFrame } from "./hero-frame"
import { HeroTabs } from "./hero-tabs"
import { RefusedCall } from "./refused-call"

interface HeroEditorProps {
  /** The definition's lines, highlighted. */
  sources: readonly CodeToken[][]
  /** The calling file's lines in full, highlighted. */
  calls: readonly CodeToken[][]
}

const SOURCE_KEYS = Array.from({ length: 20 }, (_, at) => `source-${at}`)
const CALL_KEYS = Array.from({ length: 8 }, (_, at) => `call-${at}`)

const LINE = "block h-5.75 px-4.5 leading-5.75 whitespace-pre transition-colors duration-300"
const LIT = {
  blue: "bg-[rgb(125_185_255/0.09)] shadow-[inset_2px_0_0_var(--color-tone-blue)]",
  red: "bg-[rgb(240_128_106/0.1)] shadow-[inset_2px_0_0_var(--color-tone-red)]",
} as const

function shownCalls(calls: readonly CodeToken[][], frame: HeroFrame): CodeToken[][] {
  const [read = [], query = [], create = []] = [calls[1], calls[4], calls[7]]
  return [
    calls[0] ?? [],
    sliceTokens(read, frame.typed[0]),
    frame.hints[0] ? (calls[2] ?? []) : [],
    [],
    sliceTokens(query, frame.typed[1]),
    frame.hints[1] ? (calls[5] ?? []) : [],
    [],
    sliceTokens(create, frame.typed[2]),
  ]
}

/**
 * The hero's editor: the definition on the left, lit where the call in hand
 * comes from, and calls typed against it on the right — completions while
 * a member is picked, then the type error for a create that lacks a field.
 * It runs while on screen, and rests on its last frame for a reader who
 * asked for less motion.
 *
 * @param props - The two files' lines, highlighted
 * @returns The editor
 * @example
 * ```tsx
 * <HeroEditor sources={sources} calls={calls} />
 * ```
 */
export function HeroEditor({ sources, calls }: HeroEditorProps) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const still = useReducedMotion()
  const tick = useTicker(inView && !still, 60)
  const frame = heroFrame(still ? HERO_REST : tick % HERO_CYCLE)
  return (
    <div ref={ref} className="overflow-hidden rounded-[14px] bg-panel">
      <HeroTabs lit={frame.lit.lines.length > 0} />
      <div className="grid grid-cols-1 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        <div className="dots relative min-w-0 overflow-x-auto border-b border-line py-4.5 min-[900px]:border-r min-[900px]:border-b-0">
          <div className="min-w-max font-mono text-[12.4px] text-code-plain">
            {sources.map((line, at) => (
              <span
                key={SOURCE_KEYS[at]}
                className={cn(LINE, frame.lit.lines.includes(at) && LIT[frame.lit.tone])}
              >
                <TokenLine tokens={line} />
              </span>
            ))}
          </div>
        </div>
        <div className="@container relative min-h-80 min-w-0 overflow-x-auto py-4.5">
          <div className="relative min-w-max pb-22.5 font-mono text-[12.4px] text-code-plain max-[480px]:pb-28">
            {shownCalls(calls, frame).map((line, at) => (
              <span key={CALL_KEYS[at]} className={LINE}>
                <TokenLine tokens={line} />
                {frame.caret === at && (
                  <span className="ml-px inline-block h-3.75 w-0.5 animate-caret bg-tone-blue align-[-3px]" />
                )}
              </span>
            ))}
            {frame.completion && (
              <CompletionPopup
                line={frame.completion.line + 1}
                column={frame.completion.line === 1 ? 32 : 19}
                picked={frame.completion.picked}
              />
            )}
            {frame.refused && <RefusedCall />}
          </div>
        </div>
      </div>
      <HeroStatus refused={frame.refused} />
    </div>
  )
}

function HeroStatus({ refused }: { refused: boolean }) {
  return (
    <div className="flex h-8.5 items-center gap-4 overflow-hidden border-t border-line bg-bg-subtle px-4 font-mono text-micro text-fg-subtle">
      <span
        className={cn(
          "whitespace-nowrap transition-colors duration-300",
          refused ? "text-tone-red" : "text-ok"
        )}
      >
        {refused
          ? "✕ 1 error · property 'email' is missing"
          : "✓ 0 errors · every call typed from api/sources.ts"}
      </span>
      <span className="ml-auto hidden whitespace-nowrap min-[640px]:inline">
        0 generated types · inferred from 1 definition
      </span>
    </div>
  )
}
