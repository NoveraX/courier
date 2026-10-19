/**
 * When each docs page last changed: the date its metadata writes, which the
 * page shows and search engines read — present on every page, a real day,
 * and none still to come.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { formatPageDate, isPageDate, latestPageDate } from "@/site/content/page-dates"
import { sourceMetadata } from "@/site/content/source-metadata"

const DOCS = fileURLToPath(new URL("../../src/content/docs", import.meta.url))

function pages(dir = DOCS): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return pages(file)
    return entry.name.endsWith(".mdx") ? [file] : []
  })
}

describe("a page's date", () => {
  it("names a real day as YYYY-MM-DD", () => {
    expect(isPageDate("2026-10-14")).toBe(true)
    expect(isPageDate("2026-02-30")).toBe(false)
    expect(isPageDate("2026-10-14T00:00:00Z")).toBe(false)
    expect(isPageDate(20261014)).toBe(false)
  })

  it("reads as a reader expects it, whatever the time zone", () => {
    expect(formatPageDate("2026-10-14")).toBe("Oct 14, 2026")
    expect(formatPageDate("2026-01-01")).toBe("Jan 1, 2026")
  })

  it("of pages put together is the latest of theirs", () => {
    expect(latestPageDate(["2026-10-05", "2026-10-14", undefined, "2026-09-30"])).toBe("2026-10-14")
    expect(latestPageDate([])).toBeUndefined()
  })
})

describe("every docs page", () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  it("says when it last changed, as a real day that has come", () => {
    const dates = pages().map((file) => [
      path.relative(DOCS, file),
      sourceMetadata(readFileSync(file, "utf8")).updated,
    ])
    expect(dates.length).toBeGreaterThan(90)
    for (const [page, date] of dates) {
      expect(isPageDate(date), page).toBe(true)
      expect(date && date <= tomorrow, page).toBe(true)
    }
  })
})
