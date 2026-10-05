import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

/** A TrueType font's tables, by tag, as offsets into its bytes. */
function tablesOf(font: Buffer): Map<string, number> {
  const tables = new Map<string, number>()
  const count = font.readUInt16BE(4)
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16
    tables.set(font.toString("latin1", record, record + 4), font.readUInt32BE(record + 8))
  }
  return tables
}

/* A format 4 subtable's segments: each a run of code points and how its glyphs are found. */
function readFormat4(font: Buffer, table: number, glyphs: Map<number, number>): void {
  const segments = font.readUInt16BE(table + 6) / 2
  const ends = table + 14
  const starts = ends + segments * 2 + 2
  const deltas = starts + segments * 2
  const ranges = deltas + segments * 2
  for (let i = 0; i < segments; i++) {
    const [first, last] = [font.readUInt16BE(starts + i * 2), font.readUInt16BE(ends + i * 2)]
    const delta = font.readInt16BE(deltas + i * 2)
    const range = font.readUInt16BE(ranges + i * 2)
    for (let cp = first; cp <= last && cp !== 0xffff; cp++) {
      const indexed = range === 0 ? cp : font.readUInt16BE(ranges + i * 2 + range + (cp - first) * 2)
      if (range !== 0 && indexed === 0) continue
      glyphs.set(cp, (indexed + delta) & 0xffff)
    }
  }
}

/* The font's Unicode code points and their glyphs, from its Windows Unicode `cmap` subtable. */
function glyphsByCodePoint(font: Buffer, cmap: number): Map<number, number> {
  const count = font.readUInt16BE(cmap + 2)
  for (let i = 0; i < count; i++) {
    const record = cmap + 4 + i * 8
    const table = cmap + font.readUInt32BE(record + 4)
    const unicode = font.readUInt16BE(record) === 3 && font.readUInt16BE(record + 2) === 1
    if (!unicode || font.readUInt16BE(table) !== 4) continue
    const glyphs = new Map<number, number>()
    readFormat4(font, table, glyphs)
    return glyphs
  }
  throw new Error("The font has no Windows Unicode cmap subtable of format 4")
}

function advanceOf(font: Buffer, tables: Map<string, number>, glyph: number): number {
  const metrics = font.readUInt16BE((tables.get("hhea") ?? 0) + 34)
  const hmtx = tables.get("hmtx") ?? 0
  return font.readUInt16BE(hmtx + Math.min(glyph, metrics - 1) * 4)
}

/**
 * The code points Geist Mono draws one cell wide: those the font has a
 * glyph for whose advance is the width of its digit zero.
 *
 * @returns The code points
 * @example
 * ```ts
 * monoCells().has(0x2192) // true: → is one cell
 * ```
 */
export function monoCells(): Set<number> {
  const require = createRequire(import.meta.url)
  const dist = path.dirname(require.resolve("geist/font/mono"))
  const font = readFileSync(path.join(dist, "fonts/geist-mono/GeistMono-Regular.ttf"))
  const tables = tablesOf(font)
  const glyphs = glyphsByCodePoint(font, tables.get("cmap") ?? 0)
  const cell = advanceOf(font, tables, glyphs.get(0x30) ?? 0)
  const cells = new Set<number>()
  for (const [cp, glyph] of glyphs) if (advanceOf(font, tables, glyph) === cell) cells.add(cp)
  return cells
}
