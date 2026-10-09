import { cn } from "@/site/cn"
import { type CallProgress, SESSION_MIDDLEWARE } from "./session-script"

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
  className,
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
