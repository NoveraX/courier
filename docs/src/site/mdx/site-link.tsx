import Link from "next/link"
import type { ComponentPropsWithoutRef } from "react"

const LINK =
  "text-brand underline-offset-3 hover:text-[color-mix(in_srgb,var(--color-brand)_75%,var(--color-fg))] hover:underline"

/**
 * A link in a page's text: another page of the site in place, an anchor on
 * this page as it is, and anything else in a new tab.
 *
 * @param props - The anchor's props
 * @returns The link
 * @example
 * ```tsx
 * <SiteLink href="/docs/quick-start">Quick start</SiteLink>
 * ```
 */
export function SiteLink({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) {
  if (href.startsWith("#")) {
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
