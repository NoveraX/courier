import type { BundledLanguage, ThemeRegistration } from "shiki"
import { createHighlighter } from "shiki"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"

/** The name the site's code theme is registered under. */
export const SITE_THEME_NAME = "courier-site"

/** The site's code theme: its colours are the site's code tokens, so one highlight serves both themes. */
export const SITE_THEME: ThemeRegistration = {
  name: SITE_THEME_NAME,
  type: "dark",
  fg: "var(--color-code-plain)",
  bg: "transparent",
  settings: [
    { settings: { foreground: "var(--color-code-plain)", background: "transparent" } },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "var(--color-code-comment)" },
    },
    {
      scope: [
        "keyword",
        "storage.type",
        "storage.modifier",
        "keyword.operator.new",
        "keyword.operator.expression",
        "keyword.operator.typeof",
        "constant.language",
      ],
      settings: { foreground: "var(--color-code-keyword)" },
    },
    {
      scope: ["keyword.operator", "punctuation", "meta.brace"],
      settings: { foreground: "var(--color-code-punctuation)" },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "variable.function",
        "entity.name.command",
      ],
      settings: { foreground: "var(--color-code-function)" },
    },
    {
      scope: ["string", "punctuation.definition.string", "string.template"],
      settings: { foreground: "var(--color-code-string)" },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "entity.other.inherited-class",
        "support.type",
        "support.class",
        "entity.name.tag",
      ],
      settings: { foreground: "var(--color-code-type)" },
    },
    {
      scope: ["constant.numeric", "constant.character.escape"],
      settings: { foreground: "var(--color-code-number)" },
    },
  ],
}

const LANGUAGES: BundledLanguage[] = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "bash",
  "json",
  "css",
  "html",
  "vue",
  "yaml",
  "dockerfile",
  "nginx",
  "toml",
]

const ALIASES: Readonly<Record<string, BundledLanguage>> = {
  ts: "typescript",
  js: "javascript",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
}

/** The loaded highlighter. */
export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>

let highlighter: Promise<Highlighter> | undefined

/**
 * The site's highlighter, loaded once: its code theme and the languages its
 * pages use.
 *
 * @returns The highlighter
 * @example
 * ```ts
 * const engine = await siteHighlighter()
 * ```
 */
export function siteHighlighter(): Promise<Highlighter> {
  /* The JavaScript regex engine: the WASM one crashed in Next.js workers. */
  highlighter ??= createHighlighter({
    themes: [SITE_THEME],
    langs: LANGUAGES,
    engine: createJavaScriptRegexEngine(),
  })
  return highlighter
}

/**
 * The language the highlighter knows a fence's language as, or plain text.
 *
 * @param language - The language as a fence names it: `ts`, `sh`, …
 * @returns The highlighter's language
 * @example
 * ```ts
 * languageOf("ts") // "typescript"
 * ```
 */
export function languageOf(language: string): BundledLanguage | "text" {
  const named = ALIASES[language] ?? LANGUAGES.find((known) => known === language)
  return named ?? "text"
}
