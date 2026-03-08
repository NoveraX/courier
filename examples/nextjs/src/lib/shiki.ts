import {
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight,
} from "@shikijs/transformers"
import type { BundledLanguage, BundledTheme, HighlighterGeneric, ShikiTransformer } from "shiki"
import { createHighlighter } from "shiki"

const THEME = "vitesse-dark" satisfies BundledTheme
const LANGUAGES: BundledLanguage[] = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "bash",
  "json",
  "css",
  "html",
]

let highlighter: HighlighterGeneric<BundledLanguage, BundledTheme> | null = null

async function getHighlighter() {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: [THEME],
      langs: LANGUAGES,
    })
  }
  return highlighter
}

function parseHighlightLines(highlight: (number | string)[]): number[] {
  const lines: number[] = []
  for (const item of highlight) {
    if (typeof item === "number") {
      lines.push(item)
    } else {
      const [start, end] = item.split("-").map(Number)
      for (let i = start; i <= end; i++) {
        lines.push(i)
      }
    }
  }
  return lines
}

function transformerLineHighlight(highlight: (number | string)[]): ShikiTransformer {
  const lines = parseHighlightLines(highlight)
  return {
    name: "line-highlight",
    line(node, line) {
      if (lines.includes(line)) {
        this.addClassToHast(node, "highlighted")
      }
    },
  }
}

export type HighlightOptions = {
  lang?: string
  highlight?: (number | string)[]
}

export async function highlightCode(code: string, options: HighlightOptions = {}) {
  const { lang = "typescript", highlight } = options
  const hl = await getHighlighter()

  const transformers: ShikiTransformer[] = [
    transformerNotationHighlight(),
    transformerNotationDiff(),
    transformerNotationFocus(),
  ]

  if (highlight?.length) {
    transformers.push(transformerLineHighlight(highlight))
  }

  return hl.codeToHtml(code.trim(), {
    lang,
    theme: THEME,
    transformers,
  })
}
