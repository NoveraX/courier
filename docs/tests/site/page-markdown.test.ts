/**
 * A docs page as Markdown, the way "Copy as Markdown", "View as Markdown"
 * and the assistant links hand it on: no metadata export, callouts as
 * quotes under their title, tabbed code as one fence a tab, comparisons as
 * tables, mode badges as words, and code fences exactly as written.
 */
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { jsxCells, jsxObjects, jsxRows, jsxText } from "@/site/content/jsx-literals"
import { pageMarkdown } from "@/site/content/page-markdown"

const PAGE = [
  'export const metadata = { title: "T", description: "D", mode: "proxy" }',
  "",
  "## Setup <ModeBadge mode=\"proxy\" />",
  "",
  '<Callout variant="tip" title="One instance">',
  "Create it once.",
  "",
  "Share it.",
  "</Callout>",
  "",
  "<CodeGroup",
  '  items={[{ label: "npm", code: "npm install @noverax/courier", language: "bash" },',
  '    { label: "pnpm", code: "pnpm add \\"x\\"", language: "bash" }]}',
  "/>",
  "",
  "```tsx",
  '<Callout variant="info">kept as code</Callout>',
  "```",
].join("\n")

describe("a page as Markdown", () => {
  const md = pageMarkdown(PAGE, "Title", "What it is.")

  it("starts with its title and description, without the metadata export", () => {
    expect(md.startsWith("# Title\n\nWhat it is.\n")).toBe(true)
    expect(md).not.toContain("export const metadata")
  })

  it("reads a callout as a quote under its title, and a mode badge as words", () => {
    expect(md).toContain("> **One instance**\n>\n> Create it once.\n>\n> Share it.")
    expect(md).toContain("## Setup (proxy mode)")
  })

  it("gives each tab of tabbed code its own fence, escapes read", () => {
    expect(md).toContain("**npm**\n\n```bash\nnpm install @noverax/courier\n```")
    expect(md).toContain('**pnpm**\n\n```bash\npnpm add "x"\n```')
  })

  it("leaves code fences exactly as written", () => {
    expect(md).toContain('```tsx\n<Callout variant="info">kept as code</Callout>\n```')
  })

  it("reads the comparison table of a real page as a Markdown table", () => {
    const page = new URL("../../src/content/docs/server-side/overview.mdx", import.meta.url)
    const source = readFileSync(page, "utf8")

    const table = pageMarkdown(source, "Overview", "").split("\n")

    const header = table.findIndex((line) => line.startsWith("| Feature |"))
    expect(table[header]).toBe("| Feature | Proxy Mode | Direct Mode |")
    expect(table[header + 1]).toBe("| --- | --- | --- |")
    expect(table[header + 2]).toBe("| Execution | Browser -> proxy handler -> backend | Server -> backend |")
  })
})

describe("literal JSX props", () => {
  it("read strings, objects with labels, and rows, brackets in strings left alone", () => {
    const source = 'x headers={["A [1]", { label: "B", highlight: true }]} rows={[["a", "b]"]]}'

    expect(jsxCells(source, "headers")).toEqual(["A [1]", "B"])
    expect(jsxRows(source, "rows")).toEqual([["a", "b]"]])
    expect(jsxObjects('items={[{ label: "x" }, { label: "y" }]}', "items")).toHaveLength(2)
    expect(jsxText('{ code: "a\\nb" }', "code")).toBe("a\nb")
  })
})
