import { inlineParts } from "@/site/content/inline-markdown"
import { InlineCode } from "./inline-code"
import { SiteLink } from "./site-link"

/**
 * A line of Markdown read from a page, drawn as the page draws it: its
 * code in the code face, its links as links, its strong text strong.
 *
 * @param props - The line
 * @returns The runs
 * @example
 * ```tsx
 * <InlineText text="Created with `defineApi()`." />
 * ```
 */
export function InlineText({ text }: { text: string }) {
  return inlineParts(text).map((part, at) => {
    const key = `${at}:${part.text}`
    if (part.kind === "code") return <InlineCode key={key}>{part.text}</InlineCode>
    if (part.kind === "strong") {
      return (
        <strong key={key} className="font-semibold text-fg">
          {part.text}
        </strong>
      )
    }
    if (part.kind === "link") {
      return (
        <SiteLink key={key} href={part.href}>
          <InlineText text={part.text} />
        </SiteLink>
      )
    }
    return part.text
  })
}
