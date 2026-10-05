"use client"

import { cn } from "@/site/cn"
import { useFeatureTime } from "./feature-clock"
import { TYPED_EMAIL, VALIDATION_WHOLE_TICK, validationFrame } from "./feature-frames"

/**
 * A form checked against its schema while it is filled in: a half-typed
 * address is refused before any request is made, a whole one is sent.
 *
 * @returns The demo
 * @example
 * ```tsx
 * <ValidationDemo />
 * ```
 */
export function ValidationDemo() {
  const { tick, still } = useFeatureTime()
  const typed = TYPED_EMAIL.slice(0, validationFrame(still ? VALIDATION_WHOLE_TICK : tick))
  const valid = typed.length >= TYPED_EMAIL.length
  const refused = !valid && typed.includes("@")
  return (
    <div className="mx-auto flex max-w-80 flex-col gap-2.75">
      <div>
        <div className="mb-1.25 font-mono text-micro text-fg-subtle">name</div>
        <div className="flex h-9 items-center rounded-control border border-line-strong bg-bg px-2.75 text-control text-fg">
          Ada Lovelace
        </div>
      </div>
      <div>
        <div className="mb-1.25 font-mono text-micro text-fg-subtle">email</div>
        <div
          className={cn(
            "flex h-9 items-center rounded-control border bg-bg px-2.75 font-mono text-small text-fg transition-colors duration-200",
            valid ? "border-ok" : refused ? "border-err" : "border-line-strong"
          )}
        >
          {typed}
          <span className="ml-px inline-block h-3.75 w-px animate-caret bg-fg" />
        </div>
      </div>
      <div className={cn("min-h-4.5 font-mono text-[11.5px]", valid ? "text-ok" : "text-err")}>
        {valid ? "✓ valid · POST /users sent" : refused ? "✕ Invalid email — request blocked" : ""}
      </div>
    </div>
  )
}
