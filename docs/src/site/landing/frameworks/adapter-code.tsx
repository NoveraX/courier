import { cn } from "@/site/cn"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { TokenLine } from "@/site/code/token-line"
import type { Adapter } from "./adapters"
import { ownLines } from "./adapters"

/**
 * An adapter's mount, numbered: the lines that name its handler lit, the
 * last labelled as the part that is the framework's own.
 *
 * @param props - The adapter, and its code highlighted
 * @returns The code
 * @example
 * ```tsx
 * <AdapterCode adapter={ADAPTERS[0]} lines={lines} />
 * ```
 */
export function AdapterCode({
  adapter,
  lines,
}: {
  adapter: Adapter
  lines: readonly CodeToken[][]
}) {
  const { own, last } = ownLines(adapter)
  return (
    <div className="flex-1 overflow-x-auto py-4">
      <div className="min-w-max font-mono text-[12.4px] tracking-normal text-code-plain">
        {lines.map((line, at) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: a code sample's lines are fixed and never reorder
            key={at}
            className={cn("flex h-6 leading-6", own[at] && "bg-[rgb(125_185_255/0.07)]")}
          >
            <span
              className={cn(
                "w-11 shrink-0 pr-4 text-right select-none",
                own[at] ? "text-brand" : "text-fg-subtle"
              )}
            >
              {at + 1}
            </span>
            <span className="pr-5 whitespace-pre">
              <TokenLine tokens={line} />
            </span>
            {at === last && (
              <span className="pr-4 font-mono text-micro text-brand">← framework-specific</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
