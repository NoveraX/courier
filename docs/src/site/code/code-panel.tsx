import { FileCode } from "lucide-react"

import { CodeBody } from "./code-body"
import { CopyButton } from "./copy-button"
import { highlight } from "./highlight"

/* The Unicode block of box-drawing glyphs that diagrams and file trees are drawn in. */
const BOX_DRAWING = /[\u2500-\u257F]/

interface CodePanelProps {
  code: string
  /** The fence's language, as written: `ts`, `bash`, `yaml`… */
  language: string
  /** The file the code belongs in, when the page names one. */
  filename?: string | undefined
}

/**
 * A block of code as the site shows it: a header naming its file — or
 * captioning a plain-text block, or naming its language when nothing else
 * does — a Copy button, and the highlighted code. A block drawn in
 * box-drawing glyphs is set as a drawing.
 *
 * @param props - The code, its language and its file
 * @returns The panel
 * @example
 * ```tsx
 * <CodePanel code={code} language="ts" filename="src/api/users.ts" />
 * ```
 */
export async function CodePanel({ code, language, filename }: CodePanelProps) {
  const html = await highlight(code, language)
  const label = filename ?? (language === "text" ? "" : language)
  const drawing = BOX_DRAWING.test(code)
  return (
    <div
      data-slot="code-panel"
      className="overflow-hidden rounded-panel border border-line bg-panel shadow-panel"
    >
      <div className="flex h-10 items-center gap-2 border-b border-line bg-bg-subtle pr-2 pl-3.5 font-mono text-label text-fg-muted">
        {filename && language !== "text" && (
          <FileCode aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
        )}
        <span className="min-w-0 truncate">{label}</span>
        <CopyButton text={code} className="ml-auto" />
      </div>
      <CodeBody html={html} drawing={drawing} />
    </div>
  )
}
