"use client"

import { ArrowUp, Text } from "lucide-react"
import { cn } from "@/site/cn"
import { AssistantActions } from "./assistant-actions"
import { SIDE_ACTION } from "./side-action"
import { useActiveHeading } from "./use-active-heading"
import { useHeadings } from "./use-headings"

/**
 * The page's outline beside it — each section, the one being read lit —
 * and what can be done with the page: copy it as Markdown, ask ChatGPT or
 * Claude about it — for a page written as text — and go back to the top.
 *
 * @param props - The page's title, and the page as Markdown when it is written as text
 * @returns The outline
 * @example
 * ```tsx
 * <DocsToc title={meta.title} markdown={markdown} />
 * ```
 */
export function DocsToc({ title, markdown }: { title: string; markdown?: string | undefined }) {
  const headings = useHeadings()
  const active = useActiveHeading(headings)
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-56px)] self-start overflow-y-auto py-10 min-[1240px]:block">
      {headings.length > 0 && (
        <nav aria-label="On this page" className="mb-5.5">
          <p className="m-0 mb-2.5 flex items-center gap-1.75 text-label font-semibold text-fg">
            <Text aria-hidden="true" className="size-3.25 text-fg-subtle" />
            On this page
          </p>
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              aria-current={heading.id === active ? "location" : undefined}
              className={cn(
                "block border-l py-1.25 text-control transition-colors hover:text-fg",
                heading.level === 3 ? "pl-6" : "pl-3",
                heading.id === active ? "border-brand text-fg" : "border-line text-fg-subtle"
              )}
            >
              {heading.label}
            </a>
          ))}
        </nav>
      )}
      <AssistantActions title={title} markdown={markdown}>
        <button
          type="button"
          className={SIDE_ACTION}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp aria-hidden="true" className="size-3.25 shrink-0" />
          Back to top
        </button>
      </AssistantActions>
    </aside>
  )
}
