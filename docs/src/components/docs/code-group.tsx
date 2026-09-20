import { highlightCode } from "@/lib/shiki"

import { CodeGroupTabs } from "./code-group-tabs"

type CodeGroupItem = {
  label: string
  code: string
  language?: string
  /** Shown above the snippet, for tabs whose code belongs in one named file */
  filename?: string
}

type CodeGroupProps = {
  items: CodeGroupItem[]
  className?: string
}

export async function CodeGroup({ items, className }: CodeGroupProps) {
  const highlighted = await Promise.all(
    items.map((item) => highlightCode(item.code, { lang: item.language }))
  )

  return (
    <CodeGroupTabs
      labels={items.map((item) => item.label)}
      codes={items.map((item) => item.code)}
      filenames={items.map((item) => item.filename)}
      highlighted={highlighted}
      className={className}
    />
  )
}
