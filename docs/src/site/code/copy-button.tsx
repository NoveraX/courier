"use client"

import { Check, Copy } from "lucide-react"

import { cn } from "@/site/cn"
import { copyText } from "@/site/copy-text"
import { useFlash } from "@/site/use-flash"

/**
 * Copies a code block's text, and says so on itself for a moment.
 *
 * @param props - The text, and classes for where it sits
 * @returns The button
 * @example
 * ```tsx
 * <CopyButton text={code} />
 * ```
 */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, flash] = useFlash()
  return (
    <button
      type="button"
      onClick={async () => flash(await copyText(text))}
      className={cn(
        "flex h-6.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] border border-line bg-panel px-2.25 font-sans text-meta text-fg-subtle transition-colors hover:border-line-strong hover:text-fg",
        className
      )}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3 text-ok" />
      ) : (
        <Copy aria-hidden="true" className="size-3" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}
