"use client"
import { Bot, Check, ChevronDown, Copy, FileText } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { useState } from "react"

import { assistantLinks } from "@/site/content/assistant-links"
import { copyText } from "@/site/copy-text"
import { useFlash } from "@/site/use-flash"
import { ChatGptMark } from "./chatgpt-mark"
import { ClaudeMark } from "./claude-mark"
import { MarkdownDialog } from "./markdown-dialog"
import { PageActionItem } from "./page-action-item"

interface PageActionsProps {
  title: string
  /** The file name the page reads as: `quick-start.md`. */
  fileName: string
  markdown: string
}

const ITEM =
  "flex cursor-pointer items-start gap-2.75 rounded-control px-2.5 py-2.25 text-fg outline-none data-[highlighted]:bg-bg-subtle"

/**
 * What can be done with a page from its head: copy it for an assistant in
 * one click, or — from the menu beside — copy it as Markdown, read it as
 * Markdown, open it in ChatGPT or Claude, or copy the address of the
 * index of every page.
 *
 * @param props - The page's title, file name and Markdown
 * @returns The actions
 * @example
 * ```tsx
 * <PageActions title="Quick Start" fileName="quick-start.md" markdown={markdown} />
 * ```
 */
export function PageActions({ title, fileName, markdown }: PageActionsProps) {
  const [copied, flash] = useFlash()
  const [reading, setReading] = useState(false)
  const links = assistantLinks(title, markdown)
  const copyPage = async () => flash(await copyText(markdown))
  return (
    <div className="flex h-8 items-stretch overflow-hidden rounded-[9px] border border-line bg-panel">
      <button
        type="button"
        onClick={copyPage}
        className="flex cursor-pointer items-center gap-2 px-3 text-control text-fg transition-colors hover:bg-bg-subtle"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-3.5 text-ok" />
        ) : (
          <Copy aria-hidden="true" className="size-3.5 text-fg-muted" />
        )}
        {copied ? "Copied" : "Copy for LLM"}
      </button>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger
          aria-label="More page actions"
          className="group grid w-7.5 cursor-pointer place-items-center border-l border-line text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg data-[state=open]:bg-bg-subtle"
        >
          <ChevronDown
            aria-hidden="true"
            className="size-3.25 transition-transform group-data-[state=open]:rotate-180"
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-60 w-75 animate-site-in rounded-panel border border-line-strong bg-panel p-1.5 shadow-overlay"
          >
            <DropdownMenu.Item className={ITEM} onSelect={copyPage}>
              <PageActionItem
                icon={Copy}
                title="Copy page as Markdown"
                sub="Paste the whole page into any LLM"
              />
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ITEM} onSelect={() => setReading(true)}>
              <PageActionItem
                icon={FileText}
                title="View as Markdown"
                sub="Plain text version of this page"
              />
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ITEM} asChild>
              <a href={links.chatgpt} target="_blank" rel="noopener noreferrer">
                <PageActionItem
                  icon={ChatGptMark}
                  title="Open in ChatGPT"
                  sub="Ask questions about this page"
                  external
                />
              </a>
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ITEM} asChild>
              <a href={links.claude} target="_blank" rel="noopener noreferrer">
                <PageActionItem
                  icon={ClaudeMark}
                  title="Open in Claude"
                  sub="Ask questions about this page"
                  external
                />
              </a>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={ITEM}
              onSelect={async () => flash(await copyText(`${window.location.origin}/llms.txt`))}
            >
              <PageActionItem
                icon={Bot}
                title="Copy llms.txt URL"
                sub="Index of every docs page for agents"
              />
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <MarkdownDialog
        name={fileName}
        markdown={markdown}
        open={reading}
        onOpenChange={setReading}
      />
    </div>
  )
}
