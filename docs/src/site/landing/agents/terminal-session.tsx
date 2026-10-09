"use client"

import { SquareTerminal } from "lucide-react"

import { cn } from "@/site/cn"
import { useInView } from "@/site/landing/use-in-view"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"
import { SESSION_CALLS, SESSION_PROMPT } from "./session-script"
import { StudioCalls } from "./studio-calls"
import { ConfirmBox, PromptInput, ToolHeader, ToolResult } from "./terminal-parts"
import { TERMINAL_LINES, TERMINAL_STILL, terminalFrame } from "./terminal-script"

/**
 * An agent at work on the shop's API in a terminal, as a coding agent's
 * command line shows it: the person types a request, the agent says what it
 * will do, calls the shop's tools through Courier's MCP server, and the
 * server asks the person before the call that cannot be undone — then
 * Studio, beside it, recording each call with the middleware it ran
 * through. It runs while on screen, and stands finished for a reader who
 * asked for less motion.
 *
 * @returns The terminal and Studio's panel
 * @example
 * ```tsx
 * <TerminalSession />
 * ```
 */
export function TerminalSession() {
  const [ref, inView] = useInView<HTMLDivElement>()
  const still = useReducedMotion()
  const tick = useTicker(inView && !still, 100)
  const frame = terminalFrame(still ? TERMINAL_STILL : tick)
  const [list, cancel] = SESSION_CALLS
  const [first = 0, second = 0, reply = 0] = frame.said
  const [listed = "unmade", cancelled = "unmade"] = frame.calls
  return (
    <div
      ref={ref}
      data-tone="violet"
      role="img"
      aria-label="In a terminal, a person asks an agent to cancel Ada's latest order; the agent lists her orders through the shop's MCP server, the server asks the person to confirm the cancellation, the person confirms, and Studio records both calls with the middleware they ran through"
      className="relative grid gap-2.5"
    >
      <div className="overflow-hidden rounded-[12px] border border-line bg-bg-subtle shadow-(--studio-shadow)">
        <div className="flex h-9 items-center gap-2 border-b border-line bg-panel px-3.5 font-mono text-[11px]">
          <SquareTerminal aria-hidden="true" className="size-3.5 text-fg-subtle" />
          <span className="text-fg-muted">~/shop</span>
          <span className="text-fg-subtle">— agent</span>
          <span className="ml-auto text-fg-subtle">MCP 2026-07-28</span>
        </div>
        <div className="grid min-h-[440px] content-start gap-3 px-3.5 pt-3 pb-3 font-mono text-[12px] leading-[1.6]">
          <p className="m-0 truncate text-[11px] text-fg-subtle">
            cwd ~/shop · MCP <span className="text-(--tone)">shop</span> (courier-mcp) connected, 2
            tools
          </p>
          <div className={cn("grid content-start gap-2.5", !frame.sent && "hidden")}>
            {frame.sent && (
              <p className="m-0 -mx-1.5 rounded-[5px] bg-raised/70 px-1.5 text-fg">
                <span className="text-fg-subtle">&gt; </span>
                {SESSION_PROMPT}
              </p>
            )}
            {frame.working && (
              <p className="m-0 text-fg-subtle">
                <span className="text-(--tone)">{frame.spinner}</span> Working… (esc to interrupt)
              </p>
            )}
            <Said text={TERMINAL_LINES[0]} shown={first} />
            {list && listed !== "unmade" && (
              <div className="grid gap-0.5">
                <ToolHeader call={list} />
                <ToolResult call={list} progress={listed} spinner={frame.spinner} />
              </div>
            )}
            <Said text={TERMINAL_LINES[1]} shown={second} />
            {cancel && cancelled !== "unmade" && (
              <div className="grid gap-1.5">
                <ToolHeader call={cancel} />
                <ConfirmBox call={cancel} choice={frame.confirm} />
                {frame.confirm === "confirmed" && (
                  <ToolResult call={cancel} progress={cancelled} spinner={frame.spinner} />
                )}
              </div>
            )}
            <Said text={TERMINAL_LINES[2]} shown={reply} />
          </div>
          <PromptInput text={frame.sent ? "" : SESSION_PROMPT.slice(0, frame.typed)} />
        </div>
      </div>
      <StudioCalls calls={SESSION_CALLS} progress={frame.calls} />
    </div>
  )
}

/* One thing the agent says, shown as far as it has streamed. */
function Said({ text, shown }: { text: string; shown: number }) {
  if (shown === 0) return null
  return <p className="m-0 text-fg">{text.slice(0, shown)}</p>
}
