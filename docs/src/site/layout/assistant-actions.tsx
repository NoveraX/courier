"use client"

import type { LucideIcon } from "lucide-react"
import { Check, Copy, MessageSquare, Sparkles } from "lucide-react"
import type { ReactNode } from "react"

import { assistantLinks } from "@/site/content/assistant-links"
import { copyText } from "@/site/copy-text"
import { useFlash } from "@/site/use-flash"
import { SIDE_ACTION as ACTION } from "./side-action"

function Body({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon aria-hidden="true" className="size-3.25 shrink-0" />
      {label}
    </>
  )
}

/**
 * Copy a page as Markdown, or open it in ChatGPT or Claude — as the foot
 * of a page's side column offers them — with any other action of the
 * column after them. A page with no Markdown offers only the others.
 *
 * @param props - The page's title and Markdown, and the column's other actions
 * @returns The actions
 * @example
 * ```tsx
 * <AssistantActions title="API reference" markdown={markdown} />
 * ```
 */
export function AssistantActions({
  title,
  markdown,
  children,
}: {
  title: string
  markdown?: string | undefined
  children?: ReactNode
}) {
  const [copied, flash] = useFlash()
  const links = markdown === undefined ? null : assistantLinks(title, markdown)
  return (
    <div className="mt-5.5 flex flex-col gap-0.5 border-t border-line pt-4">
      {markdown !== undefined && links && (
        <>
          <button
            type="button"
            className={ACTION}
            onClick={async () => flash(await copyText(markdown))}
          >
            <Body icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy as Markdown"} />
          </button>
          <a href={links.chatgpt} target="_blank" rel="noopener noreferrer" className={ACTION}>
            <Body icon={MessageSquare} label="Ask ChatGPT" />
          </a>
          <a href={links.claude} target="_blank" rel="noopener noreferrer" className={ACTION}>
            <Body icon={Sparkles} label="Ask Claude" />
          </a>
        </>
      )}
      {children}
    </div>
  )
}
