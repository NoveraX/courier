import { cn } from "@/site/cn"

/**
 * The small "New" badge that marks something just added, in the accent or
 * in the tone of the page it leads to.
 *
 * @param props - Its colour: the accent, or the MCP server's violet
 * @returns The badge
 * @example
 * ```tsx
 * <NewBadge tone="violet" />
 * ```
 */
export function NewBadge({ tone = "brand" }: { tone?: "brand" | "violet" }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.75 text-[10px] leading-none font-medium tracking-[0.03em] text-bg",
        tone === "brand" ? "bg-brand" : "bg-tone-violet"
      )}
    >
      New
    </span>
  )
}
