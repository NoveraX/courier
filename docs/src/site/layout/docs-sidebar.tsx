"use client"

import { GitBranch, ListFilter } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { docsNav } from "@/site/content/docs-nav"
import { filterNav } from "@/site/content/nav-filter"
import { SidebarSection } from "./sidebar-section"

/**
 * The docs navigation beside the page: the version the docs describe, a
 * filter over the pages, and the sections — the one holding the page shown
 * open, and every section open while a filter is typed.
 *
 * @param props - The version the docs describe
 * @returns The sidebar
 * @example
 * ```tsx
 * <DocsSidebar version="0.0.0" />
 * ```
 */
export function DocsSidebar({ version }: { version: string }) {
  const current = usePathname()
  const [filter, setFilter] = useState("")
  const [folded, setFolded] = useState<ReadonlyMap<string, boolean>>(new Map())
  const sections = filterNav(docsNav, filter)
  const filtering = filter.trim() !== ""
  /* A section the reader folded or unfolded stays so; any other is open when it holds the page shown. */
  const isOpen = (label: string, holdsCurrent: boolean, byDefault: boolean): boolean => {
    if (filtering) return true
    const wasFolded = folded.get(label)
    return wasFolded === undefined ? holdsCurrent || byDefault : !wasFolded
  }
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-56px-var(--consent-bar-shown,0px))] self-start overflow-y-auto pt-6 pr-4 pb-15 [scrollbar-width:thin] min-[1000px]:block">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-7.5 items-center gap-1.75 rounded-control border border-line bg-panel px-2.5 font-mono text-meta tracking-normal whitespace-nowrap text-fg-muted">
          <GitBranch aria-hidden="true" className="size-3 text-fg-subtle" />v{version}
        </span>
        <label className="flex h-7.5 min-w-0 flex-1 items-center gap-1.75 rounded-control border border-line bg-panel px-2.25 text-fg-subtle">
          <ListFilter aria-hidden="true" className="size-3 shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter pages"
            className="min-w-0 flex-1 border-0 bg-transparent text-small text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>
      </div>
      <nav aria-label="Documentation">
        {sections.map((section) => {
          const holdsCurrent = section.items.some((item) => item.href === current)
          const open = isOpen(section.label, holdsCurrent, section.defaultOpen === true)
          return (
            <SidebarSection
              key={section.label}
              section={section}
              current={current}
              open={open}
              onToggle={() => setFolded((was) => new Map(was).set(section.label, open))}
            />
          )
        })}
      </nav>
      {sections.length === 0 && (
        <p className="mt-5.5 rounded-[10px] border border-dashed border-line-strong p-3.5 text-center text-control text-fg-subtle">
          No pages match
        </p>
      )}
    </aside>
  )
}
