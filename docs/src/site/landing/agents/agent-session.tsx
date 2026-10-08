"use client"

import { Bot } from "lucide-react"

import { cn } from "@/site/cn"
import { useInView } from "@/site/landing/use-in-view"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"
import { CallRow, ConfirmCard } from "./session-parts"
import {
  SESSION_CALLS,
  SESSION_PROMPT,
  SESSION_REPLY,
  SESSION_STILL,
  sessionFrame,
} from "./session-script"
import { StudioStrip } from "./studio-strip"

/**
 * An agent at work on the shop's API, as its editor shows it: the person's
 * request, each tool call running through the app's middleware, the
 * destructive one waiting for the person to confirm it, the agent's reply —
 * and Studio below, recording every call. It runs while it is on screen,
 * and stands finished for a reader who asked for less motion.
 *
 * @returns The session
 * @example
 * ```tsx
 * <AgentSession />
 * ```
 */
export function AgentSession() {
  const [ref, inView] = useInView<HTMLDivElement>()
  const still = useReducedMotion()
  const tick = useTicker(inView && !still, 100)
  const frame = sessionFrame(still ? SESSION_STILL : tick)
  const [list, cancel] = SESSION_CALLS
  return (
    <div
      ref={ref}
      data-tone="violet"
      role="img"
      aria-label="An agent lists Ada's orders, asks the person to confirm cancelling the newest, cancels it once confirmed, and every call shows in Studio"
      className="overflow-hidden rounded-[14px] border border-line bg-panel shadow-(--studio-shadow)"
    >
      <div className="flex h-9.5 items-center gap-2.5 border-b border-line bg-bg-subtle px-3.5">
        <Bot aria-hidden="true" className="size-3.5 text-(--tone)" />
        <span className="font-mono text-[11px] text-fg-muted">agent · courier-mcp</span>
        <span className="ml-auto rounded-chip border border-line px-1.5 py-px font-mono text-[10px] text-fg-subtle">
          MCP 2026-07-28
        </span>
      </div>
      <div className="grid min-h-[372px] content-start gap-3.5 p-4">
        <div className="justify-self-end rounded-[10px] rounded-br-[3px] bg-raised px-3 py-2 text-[13px] text-fg">
          {SESSION_PROMPT.slice(0, frame.typed)}
          <span
            className={cn(
              "ml-px inline-block w-px animate-caret bg-fg",
              frame.typed >= SESSION_PROMPT.length && "hidden"
            )}
          >
            &nbsp;
          </span>
        </div>
        <p
          className={cn(
            "m-0 h-4 font-mono text-[11px] text-fg-subtle transition-opacity duration-300",
            frame.thinking ? "opacity-100" : "opacity-0"
          )}
        >
          Looking for Ada's orders…
        </p>
        {list && <CallRow call={list} progress={frame.calls[0] ?? "unmade"} />}
        {cancel && (
          <>
            <CallRow call={cancel} progress={frame.calls[1] ?? "unmade"} />
            <ConfirmCard call={cancel} state={frame.confirm} />
          </>
        )}
        <p className="m-0 min-h-5 text-[13px] text-fg">{SESSION_REPLY.slice(0, frame.replied)}</p>
      </div>
      <StudioStrip calls={SESSION_CALLS} progress={frame.calls} />
    </div>
  )
}
