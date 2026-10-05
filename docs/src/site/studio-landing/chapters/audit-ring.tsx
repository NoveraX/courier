import { cn } from "@/site/cn"

const COLOUR = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
} as const
const TEXT = { ok: "text-ok", warn: "text-warn", err: "text-err" } as const

/**
 * A session's audit score as a ring filled to the score, the number in its
 * middle, and a sweep turning while rules are re-checked.
 *
 * @param props - The score shown, its tone, and whether a check is running
 * @returns The ring
 * @example
 * ```tsx
 * <AuditRing value={88} tone="warn" checking={false} />
 * ```
 */
export function AuditRing({
  value,
  tone,
  checking,
}: {
  value: number
  tone: keyof typeof COLOUR
  checking: boolean
}) {
  return (
    <div
      role="img"
      aria-label={`Audit score ${value}`}
      className="relative size-23 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(${COLOUR[tone]} 0 ${value}%, var(--color-raised) 0 100%)`,
      }}
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full transition-opacity duration-600",
          checking ? "opacity-100" : "opacity-25"
        )}
      >
        <span
          data-a="spin"
          className="absolute inset-0 rounded-full bg-[conic-gradient(transparent_0_72%,rgb(255_255_255/0.55)_96%,transparent_100%)]"
        />
      </span>
      <div
        className={cn(
          "absolute inset-2 flex items-center justify-center rounded-full bg-panel font-mono text-[28px] font-medium tracking-[-0.04em] transition-colors duration-400",
          TEXT[tone]
        )}
      >
        {value}
      </div>
    </div>
  )
}
