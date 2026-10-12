"use client"

import { FileText, X } from "lucide-react"
import { Dialog } from "radix-ui"
import type { RefObject } from "react"

import { CopyButton } from "@/site/code/copy-button"
import { useReturnFocus } from "@/site/use-return-focus"

interface MarkdownDialogProps {
  /** The file name the page reads as: `quick-start.md`. */
  name: string
  markdown: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The control focus goes back to as the dialog closes: the button of the
   * menu it is chosen from, as the menu closes when the dialog opens.
   * Without it, focus goes back to whatever had it.
   */
  returnTo?: RefObject<HTMLElement | null>
}

/**
 * A page as plain Markdown, in a dialog over it — with its size and a way
 * to copy it.
 *
 * @param props - The page's file name and Markdown, whether it shows, and where focus goes as it closes
 * @returns The dialog
 * @example
 * ```tsx
 * <MarkdownDialog name="quick-start.md" markdown={markdown} open={open} onOpenChange={setOpen} returnTo={trigger} />
 * ```
 */
export function MarkdownDialog({
  name,
  markdown,
  open,
  onOpenChange,
  returnTo,
}: MarkdownDialogProps) {
  const returnFocus = useReturnFocus(returnTo)
  const size = `${(new TextEncoder().encode(markdown).length / 1024).toFixed(1)} KB · ${markdown.split("\n").length} lines`
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-scrim fixed inset-0 z-92 bg-(--site-scrim) backdrop-blur-xs" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={returnFocus.remember}
          onCloseAutoFocus={returnFocus.restore}
          className="overlay-dialog fixed top-1/2 left-1/2 z-93 flex max-h-[84dvh] w-[min(760px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-dialog border border-line-strong bg-panel shadow-dialog"
        >
          <div className="flex h-11.5 shrink-0 items-center gap-2.5 border-b border-line bg-bg-subtle pr-2.5 pl-4">
            <FileText aria-hidden="true" className="size-3.5 text-fg-subtle" />
            <Dialog.Title className="m-0 font-mono text-label font-normal text-fg">
              {name}
            </Dialog.Title>
            <span className="font-mono text-[11px] text-fg-subtle">{size}</span>
            <CopyButton text={markdown} className="ml-auto h-7" />
            <Dialog.Close
              aria-label="Close"
              className="grid size-7 cursor-pointer place-items-center rounded-[7px] border border-line text-fg-muted hover:text-fg"
            >
              <X aria-hidden="true" className="size-3.25" />
            </Dialog.Close>
          </div>
          <pre className="m-0 flex-1 overflow-auto px-5 py-4.5 text-[12.5px] leading-[1.7] whitespace-pre-wrap text-fg-muted">
            {markdown}
          </pre>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
