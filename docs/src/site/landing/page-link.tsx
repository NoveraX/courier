import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

interface PageLinkProps {
  /** A section of this page (`#features`) or a page of the site (`/docs/quick-start`). */
  href: string
  className?: string
  style?: CSSProperties
  onClick?: () => void
  children: ReactNode
}

/**
 * A link from the landing page: to one of its sections in place, or to
 * another page of the site.
 *
 * @param props - Where it leads, its classes and style, what a click also does, and its content
 * @returns The link
 * @example
 * ```tsx
 * <PageLink href="#features">Features</PageLink>
 * ```
 */
export function PageLink({ href, className, style, onClick, children }: PageLinkProps) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className} style={style} onClick={onClick}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} style={style} onClick={onClick}>
      {children}
    </Link>
  )
}
