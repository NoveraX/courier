import { Check, MousePointer2, ShieldAlert } from "lucide-react"

import { cn } from "@/site/cn"
import {
  type CallProgress,
  type ConfirmState,
  type ScriptCall,
  SESSION_MIDDLEWARE,
} from "./session-script"

const ACCESS_TONE = {
  read: "border-tone-teal/35 bg-tone-teal/10 text-tone-teal",
  destructive: "border-tone-red/40 bg-tone-red/10 text-tone-red",
} as const

/**
 * What a call passes through before the API answers it: the agent's
 * principal, each middleware, then the API — each lit as the call reaches it.
 *
 * @param props - How far the call has gone, and where the trail starts
 * @returns The trail
 * @example
 * ```tsx
 * <MiddlewareTrail progress={2} />
 * ```
 */
export function MiddlewareTrail({
  progress,
  className = "pl-5.5",
}: {
  progress: CallProgress
  className?: string
}) {
  const reached =
    progress === "done"
      ? SESSION_MIDDLEWARE.length + 1
      : typeof progress === "number"
        ? progress + 1
        : 0
  const stages = ["ctx.agent", ...SESSION_MIDDLEWARE, "api"]
  return (
    <div className={cn("flex flex-wrap items-center gap-1 font-mono text-[10.5px]", className)}>
      {stages.map((stage, at) => (
        <span key={stage} className="flex items-center gap-1">
          {at > 0 && (
            <span
              className={cn(
                "text-fg-subtle transition-colors duration-300",
                at <= reached && "text-(--tone)"
              )}
            >
              →
            </span>
          )}
          <span
            className={cn(
              "rounded-[5px] border px-1.5 py-0.5 transition-all duration-300",
              at <= reached
                ? "border-[rgb(var(--tone-rgb)/0.45)] bg-[rgb(var(--tone-rgb)/0.12)] text-fg"
                : "border-line text-fg-subtle"
            )}
          >
            {stage}
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * One tool call in the session: the tool, its arguments and its access,
 * then what the API answered and how long it took.
 *
 * @param props - The call, and how far it has gone
 * @returns The row
 * @example
 * ```tsx
 * <CallRow call={SESSION_CALLS[0]} progress="done" />
 * ```
 */
export function CallRow({ call, progress }: { call: ScriptCall; progress: CallProgress }) {
  const done = progress === "done"
  return (
    <div
      className={cn(
        "grid gap-1.75 transition-all duration-500",
        progress === "unmade" ? "translate-y-1 opacity-0" : "opacity-100"
      )}
    >
      <div className="flex min-w-0 items-center gap-2 font-mono text-[11.5px]">
        <span aria-hidden="true" className="text-(--tone)">
          ▸
        </span>
        <span className="truncate text-fg">{call.tool}</span>
        <span className="hidden truncate text-fg-subtle min-[440px]:inline">{call.args}</span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded-chip border px-1.5 py-px text-[10px]",
            ACCESS_TONE[call.access]
          )}
        >
          {call.access}
        </span>
      </div>
      <MiddlewareTrail progress={progress} />
      <div
        className={cn(
          "flex items-center gap-2 pl-5.5 font-mono text-[11px] transition-opacity duration-300",
          done ? "opacity-100" : "opacity-0"
        )}
      >
        <span className="text-ok">{call.status}</span>
        <span className="text-fg-subtle">{call.ms} ms</span>
        <span className="truncate text-fg-muted">{call.result}</span>
      </div>
    </div>
  )
}

/**
 * The question a destructive call puts to the person: the tool, what it
 * does and its exact arguments, answered by the person, not the model.
 *
 * @param props - The call it asks about, and where the answer stands
 * @returns The card
 * @example
 * ```tsx
 * <ConfirmCard call={SESSION_CALLS[1]} state="asking" />
 * ```
 */
export function ConfirmCard({ call, state }: { call: ScriptCall; state: ConfirmState }) {
  const pressed = state === "pressed"
  return (
    <div
      className={cn(
        "relative ml-5.5 rounded-[10px] border border-tone-red/35 bg-[linear-gradient(180deg,rgb(240_128_106/0.09),transparent)] p-3 transition-all duration-500",
        state === "hidden" ? "translate-y-1 opacity-0" : "opacity-100"
      )}
    >
      <p className="m-0 flex items-center gap-1.75 text-[12px] font-[550] text-fg">
        <ShieldAlert aria-hidden="true" className="size-3.5 text-tone-red" />
        Confirm a call that cannot be undone
      </p>
      <p className="m-0 mt-1.5 font-mono text-[11px] text-fg-muted">
        {call.verb} {call.endpoint} with {call.args}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="rounded-[6px] border border-line px-2.5 py-1 text-[11.5px] text-fg-muted">
          Decline
        </span>
        <span
          className={cn(
            "flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[11.5px] font-medium transition-all duration-200",
            pressed ? "scale-95 bg-ok text-bg" : "bg-fg text-bg"
          )}
        >
          {pressed && <Check aria-hidden="true" className="size-3" />}
          {pressed ? "Confirmed" : "Run it"}
        </span>
        <MousePointer2
          aria-hidden="true"
          className={cn(
            "size-4 fill-fg text-bg transition-all duration-700 ease-out",
            state === "asking" ? "translate-x-16 translate-y-6 opacity-0" : "opacity-100",
            state === "hidden" && "opacity-0",
            pressed && "-translate-x-7 translate-y-1.5 scale-90",
            state === "pointing" && "-translate-x-7 translate-y-1.5"
          )}
        />
      </div>
    </div>
  )
}
