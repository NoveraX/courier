import { CourierMark } from "@/site/courier-mark"

/**
 * The MCP server's name: Courier's mark, "courier", and "MCP" under it.
 *
 * @returns The wordmark
 * @example
 * ```tsx
 * <McpWordmark />
 * ```
 */
export function McpWordmark() {
  return (
    <span className="flex items-center gap-2 text-fg">
      <CourierMark width={24} />
      <span className="flex flex-col gap-0.5">
        <span className="text-[18px] leading-[0.85] font-[750] tracking-[-0.04em]">courier</span>
        <span className="pl-px text-[9px] leading-none font-[550] text-fg-muted">MCP server</span>
      </span>
    </span>
  )
}
