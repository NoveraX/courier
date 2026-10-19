import type { LucideIcon } from "lucide-react"
import { AlignLeft, ChevronRight, CornerDownLeft, FileText, Hash } from "lucide-react"
import type { MouseEvent } from "react"
import { Fragment } from "react"

import { cn } from "@/site/cn"
import { HighlightedText } from "./highlighted-text"
import type { SearchOption, SearchOptionKind } from "./search-types"

const KIND_ICONS: Readonly<Record<SearchOptionKind, LucideIcon>> = {
  page: FileText,
  heading: Hash,
  text: AlignLeft,
}

interface SearchOptionRowProps {
  option: SearchOption
  /** The row's element id, which the search box points the list's choice at. */
  domId: string
  selected: boolean
  /** The pointer moved over the row. */
  onPoint: () => void
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void
}

function keyedSteps(trail: readonly string[]): { key: string; step: string }[] {
  const keyed: { key: string; step: string }[] = []
  for (const step of trail) keyed.push({ key: `${keyed.at(-1)?.key ?? ""}/${step}`, step })
  return keyed
}

function Trail({ trail }: { trail: readonly string[] }) {
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-small text-fg-subtle">
      {keyedSteps(trail).map(({ key, step }, at) => (
        <Fragment key={key}>
          {at > 0 && <ChevronRight aria-hidden="true" className="size-2.75 shrink-0" />}
          <span className="min-w-0 truncate">{step}</span>
        </Fragment>
      ))}
    </span>
  )
}

/**
 * One result in search's list: what it is — a page, a heading or a passage
 * of text — its title with the matches marked, and where it sits, from its
 * page down. A link, so it opens in a new tab as any link does.
 *
 * @param props - The result, its element id, whether it is picked, and what pointing at it and opening it do
 * @returns The row
 * @example
 * ```tsx
 * <SearchOptionRow option={option} domId="search-3" selected onPoint={pick} onOpen={open} />
 * ```
 */
export function SearchOptionRow({
  option,
  domId,
  selected,
  onPoint,
  onOpen,
}: SearchOptionRowProps) {
  const Icon = KIND_ICONS[option.kind]
  const passage = option.kind === "text"
  return (
    <a
      id={domId}
      href={option.href}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseMove={onPoint}
      onClick={onOpen}
      className={cn(
        "flex items-start gap-2.75 rounded-control px-2.75 py-2 text-fg outline-none",
        selected && "bg-raised"
      )}
    >
      <Icon aria-hidden="true" className="mt-0.75 size-3.5 shrink-0 text-fg-subtle" />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[14px] leading-[1.45]",
            passage ? "line-clamp-2 text-fg-muted" : "truncate"
          )}
        >
          <HighlightedText parts={option.title} />
        </span>
        {option.trail.length > 0 && <Trail trail={option.trail} />}
      </span>
      {selected && (
        <CornerDownLeft aria-hidden="true" className="mt-1 size-3 shrink-0 text-fg-subtle" />
      )}
    </a>
  )
}
