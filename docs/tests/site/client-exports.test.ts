/**
 * A module marked "use client" reaches a server component as references
 * to the client's copies of its exports: a component renders through one,
 * but a constant read on the server is no longer its value — a string
 * built from it reads as Next's error for calling a client function. So a
 * client module exports components and hooks, and a constant both sides
 * read lives in a module of its own.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = new URL("../../src", import.meta.url).pathname

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe("client modules", () => {
  it("export no constant a server component could read", () => {
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const text = readFileSync(file, "utf8")
      if (!/^\s*["']use client["']/.test(text)) return []
      return [...text.matchAll(/^export const ([A-Z][A-Z0-9_]*)\b/gm)].map(
        (match) => `${relative(SRC, file)}: ${match[1]}`
      )
    })

    expect(offenders).toEqual([])
  })
})
