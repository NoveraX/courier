import type { ReactNode } from "react"

/**
 * Code written inside a sentence: in the code face, a little smaller than
 * the text around it, in the accent.
 *
 * @param props - The code
 * @returns The code
 * @example
 * ```tsx
 * <InlineCode>defineApi()</InlineCode>
 * ```
 */
export function InlineCode({ children }: { children?: ReactNode }) {
  return <code className="text-[0.875em] text-brand">{children}</code>
}
