import type { ReactNode } from "react"
import { isValidElement } from "react"

import { CodePanel } from "@/site/code/code-panel"

interface CodeProps {
  children?: unknown
  className?: unknown
}

/**
 * A fenced code block from a page, as MDX hands it over: a `<pre>` whose
 * one child is the `<code>`, with the fence's `title` on the `<pre>` itself
 * (rehype-mdx-code-props puts it there).
 *
 * @param props - The `<pre>`'s children and the fence's title
 * @returns The code panel, or the `<pre>` as it came when it holds no code
 * @example
 * ```tsx
 * <Fence title="src/api/users.ts"><code className="language-ts">…</code></Fence>
 * ```
 */
export function Fence({ children, title }: { children?: ReactNode; title?: unknown }) {
  if (!isValidElement<CodeProps>(children) || children.type !== "code") {
    return <pre>{children}</pre>
  }
  const { children: text, className } = children.props
  if (typeof text !== "string") return <pre>{children}</pre>
  const language =
    typeof className === "string" && className.startsWith("language-")
      ? className.slice("language-".length)
      : "text"
  return (
    <div className="my-5">
      <CodePanel
        code={text.replace(/\n$/, "")}
        language={language}
        filename={typeof title === "string" ? title : undefined}
      />
    </div>
  )
}
