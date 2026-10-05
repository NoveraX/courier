import type { CodeToken } from "./highlight-tokens"
import { TokenLine } from "./token-line"

/**
 * Highlighted lines inside a `<pre>`, a line break between each.
 *
 * @param props - The lines, and the `<pre>`'s classes
 * @returns The block
 * @example
 * ```tsx
 * <CodeLines lines={await highlightTokens(code, "ts")} className="text-label" />
 * ```
 */
export function CodeLines({
  lines,
  className,
}: {
  lines: readonly CodeToken[][]
  className?: string
}) {
  return (
    <pre className={className}>
      {lines.map((line, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a code sample's lines are fixed and never reorder
        <span key={at}>
          {at > 0 && "\n"}
          <TokenLine tokens={line} />
        </span>
      ))}
    </pre>
  )
}
