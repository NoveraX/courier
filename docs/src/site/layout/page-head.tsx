import { CalendarDays, ChevronRight, Clock } from "lucide-react"

import type { DocMeta } from "@/site/content/doc-module"
import type { NavSection } from "@/site/content/docs-nav"
import { formatPageDate } from "@/site/content/page-dates"
import { ModeBadge } from "@/site/mdx/mode-badge"
import { PageActions } from "./page-actions"

interface PageHeadProps {
  meta: DocMeta
  /** The navigation section the page is in, when it is in one. */
  section: NavSection | undefined
  /** How long the page takes to read, when it is written as text. */
  minutes?: number | undefined
  /** The page as Markdown, for its actions, when it is written as text. */
  page?: { fileName: string; markdown: string } | undefined
}

/**
 * The top of a docs page: where it sits in the docs, its title with what
 * can be done with the page, what it is about, how long it takes to read
 * and when it last changed — with the way of calling the API it is about,
 * when it is about one.
 *
 * @param props - The page's metadata and section, and — for a page written as text — its reading time and Markdown
 * @returns The head
 * @example
 * ```tsx
 * <PageHead meta={meta} section={section} minutes={4} page={{ fileName: "quick-start.md", markdown }} />
 * ```
 */
export function PageHead({ meta, section, minutes, page }: PageHeadProps) {
  const SectionIcon = section?.icon
  return (
    <header>
      {/* DocSearch files the page under the section DocSearch-lvl0 names, and
          leaves the trail itself out of the page's text. */}
      {section && SectionIcon && (
        <p className="DocSearch-skip m-0 mb-5 flex items-center gap-2 text-control text-fg-subtle">
          <SectionIcon aria-hidden="true" className="size-3.25 text-brand" />
          <span className="DocSearch-lvl0">{section.label}</span>
          <ChevronRight aria-hidden="true" className="size-3" />
          <span className="text-fg-muted">{meta.title}</span>
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="m-0 text-h1 font-semibold tracking-h1 text-fg">{meta.title}</h1>
        {page && (
          <PageActions title={meta.title} fileName={page.fileName} markdown={page.markdown} />
        )}
      </div>
      <p className="m-0 mt-4 max-w-[64ch] text-lead text-fg-muted">{meta.description}</p>
      <div className="mt-5.5 flex flex-wrap items-center gap-x-4.5 gap-y-2 border-b border-line pb-6.5 text-small text-fg-subtle">
        {minutes !== undefined && (
          <span className="flex items-center gap-1.5">
            <Clock aria-hidden="true" className="size-3.25" />
            {minutes} min read
          </span>
        )}
        {meta.updated && (
          <span className="flex items-center gap-1.5">
            <CalendarDays aria-hidden="true" className="size-3.25" />
            <span>
              Updated <time dateTime={meta.updated}>{formatPageDate(meta.updated)}</time>
            </span>
          </span>
        )}
        {meta.mode && <ModeBadge mode={meta.mode} />}
      </div>
    </header>
  )
}
