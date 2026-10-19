"use client"

import { BookMarked, ChevronRight, GitCommitHorizontal, Package } from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"

import type { BuilderVerb, EntryPoint } from "@/site/content/reference-modules"
import type { SearchEntry } from "@/site/content/search-index"
import { PageActions } from "@/site/layout/page-actions"
import { SiteHeader } from "@/site/layout/site-header"
import { SearchDialog } from "@/site/search/search-dialog"
import { useSearchDialog } from "@/site/search/use-search-dialog"
import { SiteFooter } from "@/site/site-footer"
import { BuilderTable } from "./builder-table"
import { EntryPointsTable } from "./entry-points-table"
import { ExportSection } from "./export-section"
import type { ReferenceSection } from "./reference-data"
import { ReferenceDrawer } from "./reference-drawer"
import type { ListedExport } from "./reference-sidebar"
import { ReferenceSidebar } from "./reference-sidebar"
import { useSectionSpy } from "./use-section-spy"

const TITLE = "API reference"

interface ReferenceViewProps {
  sections: readonly ReferenceSection[]
  /** What search finds: the exports, then every docs page, as from the docs. */
  searchable: readonly SearchEntry[]
  entryPoints: readonly EntryPoint[]
  verbs: readonly BuilderVerb[]
  version: string
  markdown: string
}

function matches(section: ReferenceSection, filter: string): boolean {
  const query = filter.trim().toLowerCase()
  return !query || `${section.name} ${section.from} ${section.desc}`.toLowerCase().includes(query)
}

/**
 * The API reference, under the header the docs share: every export the
 * docs describe, listed beside with a filter over them and the one being
 * read lit, each with its module, signature, fields and example — then the
 * modules to import from and how an endpoint begins. ⌘K, or Search, finds
 * the exports and every docs page.
 *
 * @param props - The exports, what search finds, the modules, the builder's starters, the version and the page as Markdown
 * @returns The page
 * @example
 * ```tsx
 * <ReferenceView sections={sections} searchable={entries} entryPoints={ENTRY_POINTS} verbs={BUILDER_VERBS} version="0.0.0" markdown={md} />
 * ```
 */
export function ReferenceView({
  sections,
  searchable,
  entryPoints,
  verbs,
  version,
  markdown,
}: ReferenceViewProps) {
  const [filter, setFilter] = useState("")
  const [listing, setListing] = useState(false)
  const search = useSearchDialog()
  const menuButton = useRef<HTMLButtonElement>(null)
  const shown = sections.filter((section) => matches(section, filter))
  const listed: ListedExport[] = [
    ...shown.map(({ id, name, kind }) => ({ id, name, kind })),
    { id: "builder", name: "Endpoint builder", kind: "BUILDER" },
  ]
  const active = useSectionSpy(listed.map((entry) => entry.id))
  const exportFilter = {
    value: filter,
    onChange: setFilter,
    shown: shown.length,
    total: sections.length,
  }
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader
        part="api"
        onSearch={() => search.setOpen(true)}
        onMenu={() => setListing(true)}
        searchRef={search.opener}
        menuRef={menuButton}
      />
      <SearchDialog
        entries={searchable}
        open={search.open}
        onOpenChange={search.setOpen}
        returnTo={search.opener}
      />
      <ReferenceDrawer
        exports={listed}
        filter={exportFilter}
        open={listing}
        onOpenChange={setListing}
        returnTo={menuButton}
      />
      <div className="mx-auto grid max-w-[1520px] grid-cols-1 gap-10 px-6 min-[1000px]:grid-cols-[252px_minmax(0,1fr)]">
        <ReferenceSidebar
          exports={listed}
          filter={exportFilter}
          active={active}
          title={TITLE}
          markdown={markdown}
        />
        <main id="main-content" className="min-w-0 max-w-[900px] pt-10 pb-30">
          <p className="m-0 mb-5 flex items-center gap-2 text-control text-fg-subtle">
            <BookMarked aria-hidden="true" className="size-3.25 text-brand" />
            <Link href={"/docs/introduction"} className="-my-1.5 py-1.5 hover:text-fg">
              Docs
            </Link>
            <ChevronRight aria-hidden="true" className="size-3" />
            <span className="text-fg-muted">{TITLE}</span>
          </p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="m-0 text-h1 font-semibold tracking-h1 text-fg">{TITLE}</h1>
            <PageActions title={TITLE} fileName="api-reference.md" markdown={markdown} />
          </div>
          <p className="m-0 mt-4 max-w-[62ch] text-lead text-fg-muted">
            Every export the docs describe, read from its page: where to import it from, its
            signature, the fields it takes and an example. Generics carry through from your
            definition, so the types here are the types at the call site.
          </p>
          <div className="mt-5.5 flex flex-wrap items-center gap-x-4.5 gap-y-2 border-b border-line pb-6.5 text-small text-fg-subtle">
            <span className="flex items-center gap-1.5">
              <Package aria-hidden="true" className="size-3.25" />
              {sections.length} exports
            </span>
            <span className="flex items-center gap-1.5">
              <GitCommitHorizontal aria-hidden="true" className="size-3.25" />v{version}
            </span>
          </div>
          <EntryPointsTable entryPoints={entryPoints} />
          {shown.map((section) => (
            <ExportSection key={section.id} section={section} />
          ))}
          {shown.length === 0 && (
            <p className="mt-10 rounded-[10px] border border-dashed border-line-strong p-5 text-center text-control text-fg-subtle">
              No export matches “{filter.trim()}”
            </p>
          )}
          <BuilderTable verbs={verbs} />
        </main>
      </div>
      <SiteFooter />
    </div>
  )
}
