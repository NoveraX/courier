import { jsxCells, jsxObjects, jsxRows, jsxText } from "./jsx-literals"

const CALLOUT_OPEN = /^<Callout\b(.*)>\s*$/
const MODE_BADGE = /\s*<ModeBadge mode="(\w+)" \/>/g

function withoutMetadata(lines: readonly string[]): string[] {
  const start = lines.findIndex((line) => line.startsWith("export const metadata"))
  if (start < 0) return [...lines]
  let depth = 0
  let end = start
  for (; end < lines.length; end++) {
    const line = lines[end] ?? ""
    depth += (line.match(/[{[]/g)?.length ?? 0) - (line.match(/[}\]]/g)?.length ?? 0)
    if (depth <= 0) break
  }
  return [...lines.slice(0, start), ...lines.slice(end + 1)]
}

function calloutLines(attributes: string, body: readonly string[]): string[] {
  const title = /title="([^"]*)"/.exec(attributes)?.[1]
  const quoted = body.map((line) => (line.trim() === "" ? ">" : `> ${line}`))
  return title ? [`> **${title}**`, ">", ...quoted] : quoted
}

function codeGroupLines(source: string): string[] {
  return jsxObjects(source, "items").flatMap((item) => {
    const label = jsxText(item, "label") ?? ""
    const language = jsxText(item, "language") ?? ""
    return [`**${label}**`, "", `\`\`\`${language}`, jsxText(item, "code") ?? "", "```", ""]
  })
}

function tableLines(source: string): string[] {
  const headers = jsxCells(source, "headers")
  const rows = jsxRows(source, "rows")
  const cells = (row: readonly string[]) => `| ${row.join(" | ")} |`
  return [cells(headers), cells(headers.map(() => "---")), ...rows.map(cells)]
}

/**
 * A docs page as plain Markdown, to read or hand to an assistant: its title
 * and description on top, its metadata export gone, a callout as a quote
 * under its title, tabbed code as one fence a tab, a comparison as a
 * Markdown table, and a mode badge as words — code fences left as written.
 *
 * @param source - The page's MDX source
 * @param title - The page's title
 * @param description - The page's description
 * @returns The Markdown
 * @example
 * ```ts
 * pageMarkdown(source, "Quick Start", "Install the package…").split("\n")[0] // "# Quick Start"
 * ```
 */
export function pageMarkdown(source: string, title: string, description: string): string {
  const lines = withoutMetadata(source.split("\n"))
  const out: string[] = [`# ${title}`, "", description, ""]
  let fenced = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (line.trimStart().startsWith("```")) fenced = !fenced
    if (fenced || line.trimStart().startsWith("```")) {
      out.push(line)
      continue
    }
    const callout = CALLOUT_OPEN.exec(line)
    if (callout) {
      const end = lines.indexOf("</Callout>", i)
      out.push(...calloutLines(callout[1] ?? "", lines.slice(i + 1, end < 0 ? undefined : end)))
      i = end < 0 ? lines.length : end
      continue
    }
    if (line.startsWith("<CodeGroup") || line.startsWith("<ComparisonTable")) {
      let end = i
      while (end < lines.length && !(lines[end] ?? "").trimEnd().endsWith("/>")) end++
      const block = lines.slice(i, end + 1).join("\n")
      out.push(...(line.startsWith("<CodeGroup") ? codeGroupLines(block) : tableLines(block)))
      i = end
      continue
    }
    out.push(line.replace(MODE_BADGE, (_, mode: string) => ` (${mode} mode)`))
  }
  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`
}
