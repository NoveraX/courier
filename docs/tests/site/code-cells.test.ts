/**
 * The docs set code in Geist Mono, and code lines up only while every glyph
 * in it is one the font draws a cell wide: a glyph it lacks comes from
 * another font, wider, and pushes the rest of its line over. So every glyph
 * in a page's code — samples, diagrams and file trees, fenced or inline — is
 * one of the font's own; a diagram's box closes on the column it opens on;
 * and the comments of a file tree start on one column.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { monoCells } from "./font-cells"

const DOCS = fileURLToPath(new URL("../../src/content/docs", import.meta.url))

interface Block {
  page: string
  /** The line of the page the block starts on, 1-based. */
  line: number
  language: string
  lines: string[]
}

function pagesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return pagesIn(file)
    return entry.name.endsWith(".mdx") ? [file] : []
  })
}

/* Every fenced block of a page; the text between them is prose, with its inline code. */
function blocksOf(page: string): { page: string; blocks: Block[]; prose: [number, string][] } {
  const source = readFileSync(page, "utf8").split("\n")
  const blocks: Block[] = []
  const prose: [number, string][] = []
  let open: Block | null = null
  source.forEach((text, at) => {
    const fence = /^\s*```(\w*)/.exec(text)
    if (open && fence) {
      blocks.push(open)
      open = null
    } else if (fence) {
      open = {
        page: path.relative(DOCS, page),
        line: at + 1,
        language: fence[1] || "text",
        lines: [],
      }
    } else if (open) open.lines.push(text)
    else prose.push([at + 1, text])
  })
  return { page: path.relative(DOCS, page), blocks, prose }
}

const PAGES = pagesIn(DOCS).map(blocksOf)
const BLOCKS = PAGES.flatMap((page) => page.blocks)

function cellsOf(line: string): string[] {
  return Array.from(line)
}

describe("the docs' code", () => {
  it("uses only glyphs the site's monospace font draws a cell wide", () => {
    const cells = monoCells()
    const strays = new Set<string>()
    const check = (where: string, text: string): void => {
      for (const glyph of cellsOf(text)) {
        const cp = glyph.codePointAt(0) ?? 0
        if (glyph !== "\t" && !cells.has(cp)) {
          strays.add(`${where} ${glyph} U+${cp.toString(16).toUpperCase().padStart(4, "0")}`)
        }
      }
    }
    for (const block of BLOCKS) {
      block.lines.forEach((text, at) => {
        check(`${block.page}:${block.line + 1 + at}`, text)
      })
    }
    for (const page of PAGES) {
      for (const [line, text] of page.prose) {
        for (const span of text.match(/`[^`]+`/g) ?? []) check(`${page.page}:${line}`, span)
      }
    }

    expect([...strays]).toEqual([])
  })
})

describe("a diagram", () => {
  it("closes every box on the column it opens on", () => {
    const open: string[] = []
    for (const block of BLOCKS) {
      const grid = block.lines.map(cellsOf)
      grid.forEach((row, top) => {
        const left = row.indexOf("┌")
        const right = row.indexOf("┐", left)
        if (left < 0 || right < 0) return
        for (let at = top + 1; at < grid.length; at++) {
          const edge = grid[at]?.[right]
          const closing = grid[at]?.[left] === "└"
          const wanted = closing ? "┘" : "│┤"
          if (edge === undefined || !wanted.includes(edge)) {
            open.push(
              `${block.page}:${block.line + 1 + at} the box opened on line ${block.line + 1 + top}`
            )
            break
          }
          if (closing) break
        }
      })
    }

    expect(open).toEqual([])
  })
})

describe("a file tree", () => {
  it("starts its comments on one column", () => {
    const ragged: string[] = []
    for (const block of BLOCKS.filter((b) => b.language === "text")) {
      const columns = block.lines.flatMap((text) => {
        const cells = cellsOf(text)
        const at = cells.findIndex(
          (glyph, i) =>
            (glyph === "#" || glyph === "←") && cells[i - 1] === " " && cells[i - 2] === " "
        )
        return at > 0 && /\S/.test(cells.slice(0, at).join("")) ? [at] : []
      })
      if (new Set(columns).size > 1)
        ragged.push(`${block.page}:${block.line} at ${[...new Set(columns)].join(", ")}`)
    }

    expect(ragged).toEqual([])
  })
})
