import type { EntryPoint } from "./reference-modules"

/** What the Markdown needs of a code block. */
interface MarkdownCode {
  code: string
}

/** What the Markdown needs of a named part. */
interface MarkdownField {
  name: string
  desc: string
}

/** What the Markdown needs of a field. */
interface MarkdownParam extends MarkdownField {
  code?: MarkdownCode | null | undefined
  fields: readonly MarkdownField[]
}

/** What the Markdown needs of an export. */
interface MarkdownEntry {
  name: string
  importLine: string
  desc: string
  params: readonly MarkdownParam[]
  signature: MarkdownCode | null
  example: MarkdownCode | null
}

function fieldLine({ name, desc }: MarkdownField): string {
  return desc ? `- \`${name}\` — ${desc}` : `- \`${name}\``
}

function paramLines({ code, fields, ...field }: MarkdownParam): string[] {
  const body = code ? ["", "  ```ts", ...code.code.split("\n").map((l) => `  ${l}`), "  ```"] : []
  const nested = fields.map((f) => `  ${fieldLine(f)}`)
  return [fieldLine(field), ...body, ...(nested.length > 0 ? ["", ...nested] : [])]
}

function entryLines({
  name,
  importLine,
  desc,
  params,
  signature,
  example,
}: MarkdownEntry): string[] {
  return [
    "",
    `## ${name}`,
    "",
    ...(importLine ? ["```ts", importLine, "```", ""] : []),
    desc,
    ...(signature ? ["", "```ts", signature.code, "```"] : []),
    ...(params.length > 0 ? ["", ...params.flatMap(paramLines)] : []),
    ...(example ? ["", "Example:", "", "```ts", example.code, "```"] : []),
  ]
}

/**
 * The API reference as one Markdown page, for an assistant: where each
 * export is imported from, then each export — its import, what it does,
 * its signature, the fields it takes and an example.
 *
 * @param entries - The exports
 * @param entryPoints - The modules they come from
 * @returns The Markdown
 * @example
 * ```ts
 * referenceMarkdown(sections, ENTRY_POINTS).split("\n")[0] // "# API reference — @noverax/courier"
 * ```
 */
export function referenceMarkdown(
  entries: readonly MarkdownEntry[],
  entryPoints: readonly EntryPoint[]
): string {
  const lines = [
    "# API reference — @noverax/courier",
    "",
    "## Entry points",
    "",
    ...entryPoints.map(({ module, note }) => `- \`${module}\` — ${note}`),
    ...entries.flatMap(entryLines),
  ]
  return `${lines.join("\n")}\n`
}
