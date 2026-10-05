import { Link2 } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/site/cn"
import { textOf } from "./text-of"

const LEVEL = {
  2: "mt-14 mb-0 text-h2 tracking-h2",
  3: "mt-9 mb-0 text-h3 tracking-[-0.02em]",
  4: "mt-7 mb-0 text-body tracking-[-0.015em]",
} as const

interface HeadingProps {
  level: keyof typeof LEVEL
  id?: string | undefined
  children?: ReactNode
}

/**
 * A section heading of a page, with a link to it that shows on hover or
 * focus — its id comes from its text, so the link can be shared.
 *
 * @param props - The level, the id rehype-slug gave it, and its text
 * @returns The heading
 * @example
 * ```tsx
 * <Heading level={2} id="install">Install</Heading>
 * ```
 */
export function Heading({ level, id, children }: HeadingProps) {
  const Tag = `h${level}` as const
  return (
    <Tag
      id={id}
      className={cn(
        "group flex scroll-mt-20 flex-wrap items-center gap-x-2.5 gap-y-1 font-semibold text-fg",
        LEVEL[level]
      )}
    >
      {children}
      {id && (
        <a
          href={`#${id}`}
          aria-label={`Link to ${textOf(children).trim()}`}
          className="flex text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Link2 aria-hidden="true" className="size-3.5" />
        </a>
      )}
    </Tag>
  )
}
