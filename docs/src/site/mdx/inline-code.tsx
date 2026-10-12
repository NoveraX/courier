import type { ReactNode } from "react"

/**
 * Code written inside a sentence: in the code face, a little smaller than
 * the text around it, in the accent. A name longer than the line, such as
 * `ConfigurationError("PROXY_BODY_NOT_SUPPORTED")` on a phone, breaks onto
 * the next line rather than pushing the page wider than the screen.
 *
 * @param props - The code
 * @returns The code
 * @example
 * ```tsx
 * <InlineCode>defineApi()</InlineCode>
 * ```
 */
export function InlineCode({ children }: { children?: ReactNode }) {
  return <code className="text-[0.875em] wrap-break-word text-brand">{children}</code>
}
