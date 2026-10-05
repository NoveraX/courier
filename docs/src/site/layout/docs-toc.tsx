"use client"

import type { LucideIcon } from "lucide-react"
import { ArrowUp, Check, Copy, MessageSquare, Sparkles, Text } from "lucide-react"
import { cn } from "@/site/cn"
import { assistantLinks } from "@/site/content/assistant-links"
import { copyText } from "@/site/copy-text"
import { useFlash } from "@/site/use-flash"
import { useActiveHeading } from "./use-active-heading"
import { useHeadings } from "./use-headings"

const ACTION =
  "flex cursor-pointer items-center gap-2 py-1.5 text-left text-control text-fg-subtle transition-colors hover:text-fg"

function Action({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <>
      <Icon aria-hidden="true" className="size-3.25 shrink-0" />
      {children}
    </>
  )
}

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
  const [copied, flash] = useFlash()
  const links = markdown === undefined ? null : assistantLinks(title, markdown)
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
      <div className="flex flex-col gap-0.5 border-t border-line pt-4">
        {markdown !== undefined && links && (
          <>
            <button
              type="button"
              className={ACTION}
              onClick={async () => flash(await copyText(markdown))}
            >
              <Action icon={copied ? Check : Copy}>{copied ? "Copied" : "Copy as Markdown"}</Action>
            </button>
            <a href={links.chatgpt} target="_blank" rel="noopener noreferrer" className={ACTION}>
              <Action icon={MessageSquare}>Ask ChatGPT</Action>
            </a>
            <a href={links.claude} target="_blank" rel="noopener noreferrer" className={ACTION}>
              <Action icon={Sparkles}>Ask Claude</Action>
            </a>
          </>
        )}
        <button
          type="button"
          className={ACTION}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <Action icon={ArrowUp}>Back to top</Action>
        </button>
      </div>
    </aside>
  )
}
