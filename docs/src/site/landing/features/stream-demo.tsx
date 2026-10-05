"use client"

import { useFeatureTime } from "./feature-clock"
import { STREAM_TOKENS, streamFrame } from "./feature-frames"

/**
 * An answer streamed into a chat: the question, then the reply growing
 * word by word as each chunk arrives.
 *
 * @returns The demo
 * @example
 * ```tsx
 * <StreamDemo />
 * ```
 */
export function StreamDemo() {
  const { tick, still } = useFeatureTime()
  const arrived = still ? STREAM_TOKENS.length : streamFrame(tick)
  return (
    <div className="mx-auto flex max-w-[340px] flex-col gap-2.5">
      <div className="max-w-4/5 self-end rounded-[12px_12px_3px_12px] border border-line-strong bg-raised px-3.25 py-2.25 text-control text-fg">
        What does Courier do?
      </div>
      <div className="min-h-21 max-w-[92%] self-start rounded-[12px_12px_12px_3px] border border-[rgb(var(--tone-rgb)/0.22)] bg-[rgb(var(--tone-rgb)/0.07)] px-3.25 py-2.5 text-control leading-[1.55] text-fg-muted">
        {STREAM_TOKENS.slice(0, arrived).join("")}
        <span className="ml-0.5 inline-block h-3.25 w-1.5 animate-caret bg-(--tone) align-[-2px]" />
      </div>
      <div className="flex justify-between font-mono text-micro text-fg-subtle">
        <span>text/event-stream</span>
        <span>
          chunk {arrived} / {STREAM_TOKENS.length}
        </span>
      </div>
    </div>
  )
}
