import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

interface PageLinkProps {
  /**
   * A section of this page (`#features`), a page of the site
   * (`/docs/quick-start`), or another site (`https://…`), which opens in a
   * new tab.
   */
  href: string
  className?: string
  style?: CSSProperties
  onClick?: () => void
  /** It leads to the page it is on, marked as the current page. */
  current?: boolean
  children: ReactNode
}

/**
 * A link from the landing page: to one of its sections in place, to
 * another page of the site, or to another site in a new tab.
 *
 * @param props - Where it leads, its classes and style, what a click also does, whether it is the page itself, and its content
 * @returns The link
 * @example
 * ```tsx
 * <PageLink href="#features">Features</PageLink>
 * ```
 */
export function PageLink({
  href,
  className,
  style,
  onClick,
  current = false,
  children,
}: PageLinkProps) {
  const page = current ? "page" : undefined
  if (href.startsWith("#")) {
    return (
      <a href={href} aria-current={page} className={className} style={style} onClick={onClick}>
        {children}
      </a>
    )
  }
  if (href.startsWith("https://")) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-current={page}
        className={className}
        style={style}
        onClick={onClick}
      >
        {children}
      </a>
    )
  }
  return (
    <Link href={href} aria-current={page} className={className} style={style} onClick={onClick}>
      {children}
    </Link>
  )
}
