import {
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight,
} from "@shikijs/transformers"
import type { BundledLanguage, BundledTheme, HighlighterGeneric, ShikiTransformer } from "shiki"
import { createHighlighter } from "shiki"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"

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

// Use globalThis to persist the highlighter across Next.js HMR / workers
const globalForShiki = globalThis as unknown as {
  __shikiHighlighter: HighlighterGeneric<BundledLanguage, BundledTheme> | undefined
  __shikiPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | undefined
}

async function getHighlighter() {
  if (globalForShiki.__shikiHighlighter) {
    return globalForShiki.__shikiHighlighter
  }

  if (!globalForShiki.__shikiPromise) {
    globalForShiki.__shikiPromise = createHighlighter({
      themes: [THEME],
      langs: LANGUAGES,
      // Use pure JS regex engine instead of WASM (oniguruma) to avoid
      // "memory access out of bounds" crashes in Next.js workers
      engine: createJavaScriptRegexEngine(),
    }).then((hl) => {
      globalForShiki.__shikiHighlighter = hl
      globalForShiki.__shikiPromise = undefined
      return hl
    })
  }

  return globalForShiki.__shikiPromise
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

  try {
    return hl.codeToHtml(code.trim(), {
      lang,
      theme: THEME,
      transformers,
    })
  } catch {
    // Stale WASM-based highlighter cached in globalThis — discard it
    // so the next call creates a fresh JS-engine instance
    globalForShiki.__shikiHighlighter = undefined
    globalForShiki.__shikiPromise = undefined

    const freshHl = await getHighlighter()
    return freshHl.codeToHtml(code.trim(), {
      lang,
      theme: THEME,
      transformers,
    })
  }
}
