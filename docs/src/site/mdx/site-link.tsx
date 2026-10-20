import Link from "next/link"
import type { ComponentPropsWithoutRef } from "react"

/* Underlined faintly at rest, as colour alone does not tell a link from the text around it,
   and fully on hover. */
const LINK =
  "text-brand underline decoration-current/40 underline-offset-3 hover:text-[color-mix(in_srgb,var(--color-brand)_75%,var(--color-fg))] hover:decoration-current"

/**
 * A link in a page's text: another page of the site in place, an anchor on
 * this page or an e-mail address as it is, and anything else in a new tab.
 *
 * @param props - The anchor's props
 * @returns The link
 * @example
 * ```tsx
 * <SiteLink href="/docs/quick-start">Quick start</SiteLink>
 * ```
 */
export function SiteLink({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) {
  if (href.startsWith("#") || href.startsWith("mailto:")) {
    return (
      <a href={href} className={LINK} {...props}>
        {children}
      </a>
    )
  }
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={LINK} {...props}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK} {...props}>
      {children}
    </a>
  )
}
