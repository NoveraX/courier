import { FileCode } from "lucide-react"

import { highlightCode } from "@/lib/shiki"
import { cn } from "@/lib/utils"

import { CopyButton } from "./copy-button"

type CodeBlockProps = {
  code: string
  language?: string
  filename?: string
  showLineNumbers?: boolean
  highlight?: (number | string)[]
  className?: string
}

export async function CodeBlock({
  code,
  language = "typescript",
  filename,
  showLineNumbers = false,
  highlight,
  className,
}: CodeBlockProps) {
  const html = await highlightCode(code, { lang: language, highlight })

  return (
    <div
      data-slot="code-block"
      className={cn(
        "group relative overflow-hidden rounded-lg border border-code-border bg-code-bg glow-code",
        className
      )}
    >
      {filename && (
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 text-xs text-zinc-400">
          <FileCode className="h-3.5 w-3.5" />
          <span className="font-mono">{filename}</span>
        </div>
      )}
      <div className="relative">
        <CopyButton code={code} />
        <div
          className={cn("shiki-wrapper overflow-x-auto", showLineNumbers && "show-line-numbers")}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
