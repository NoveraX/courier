"use client"

import { Package } from "lucide-react"

import { cn } from "@/site/cn"
import type { ReferenceKind } from "@/site/content/reference"
import { AssistantActions } from "@/site/layout/assistant-actions"
import { KIND_LOOK } from "./kind-look"

/** An export as the side list names it. */
export interface ListedExport {
  id: string
  name: string
  kind: ReferenceKind | "BUILDER"
}

interface ReferenceSidebarProps {
  exports: readonly ListedExport[]
  /** The export being read. */
  active: string | undefined
  title: string
  markdown: string
}

/**
 * The exports beside the API reference, each marked by its kind, the one
 * being read lit — and copying the reference or asking an assistant about
 * it at the foot.
 *
 * @param props - The exports listed, the one being read, and the page's title and Markdown
 * @returns The sidebar
 * @example
 * ```tsx
 * <ReferenceSidebar exports={listed} active="create-caller" title="API reference" markdown={md} />
 * ```
 */
export function ReferenceSidebar({ exports, active, title, markdown }: ReferenceSidebarProps) {
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-56px)] self-start overflow-y-auto pt-7 pb-15 min-[1000px]:block">
      <p className="m-0 mb-2.5 flex items-center gap-1.75 text-label font-semibold text-fg">
        <Package aria-hidden="true" className="size-3.25 text-fg-subtle" />
        Exports
      </p>
      <nav aria-label="Exports" className="border-l border-line">
        {exports.map(({ id, name, kind }) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={id === active ? "location" : undefined}
            className={cn(
              "-ml-px flex items-center gap-2.25 border-l py-1.5 pr-2.5 pl-3.25 font-mono text-small transition-colors hover:text-fg",
              id === active ? "border-brand text-fg" : "border-transparent text-fg-muted"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 shrink-0 rounded-[2px]",
                kind === "BUILDER" ? "bg-fg-subtle" : KIND_LOOK[kind].dot
              )}
            />
            <span className="truncate">{name}</span>
          </a>
        ))}
      </nav>
      <AssistantActions title={title} markdown={markdown} />
    </aside>
  )
}
