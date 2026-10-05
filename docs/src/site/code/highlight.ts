import type { BundledLanguage, ThemeRegistration } from "shiki"
import { createHighlighter } from "shiki"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"

const THEME_NAME = "courier-site"

/* Colours are the site's code tokens, so one highlight serves both themes. */
const SITE_THEME: ThemeRegistration = {
  name: THEME_NAME,
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

type Highlighter = Awaited<ReturnType<typeof createHighlighter>>

let highlighter: Promise<Highlighter> | undefined

function load(): Promise<Highlighter> {
  /* The JavaScript regex engine: the WASM one crashed in Next.js workers. */
  highlighter ??= createHighlighter({
    themes: [SITE_THEME],
    langs: LANGUAGES,
    engine: createJavaScriptRegexEngine(),
  })
  return highlighter
}

function languageOf(language: string): BundledLanguage | "text" {
  const named = ALIASES[language] ?? LANGUAGES.find((known) => known === language)
  return named ?? "text"
}

/**
 * Code as highlighted HTML in the site's code colours: a `<pre>` of one
 * `<span class="line">` per line. A language the site does not load is
 * shown as plain text.
 *
 * @param code - The code
 * @param language - Its language, as a fence names it (`ts`, `bash`, …)
 * @returns The HTML
 * @example
 * ```ts
 * const html = await highlight('const a = "b"', "ts")
 * ```
 */
export async function highlight(code: string, language: string): Promise<string> {
  const engine = await load()
  return engine.codeToHtml(code, { lang: languageOf(language), theme: THEME_NAME })
}
