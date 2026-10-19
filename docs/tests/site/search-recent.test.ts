/**
 * Search keeps the results the reader opened, newest first and once each,
 * in the browser's storage. What the storage holds is the reader's to
 * change, so search takes only entries of the right shape that lead to a
 * page of the site, and a browser that refuses storage keeps nothing.
 */
import { describe, expect, it, vi } from "vitest"

import type { RecentStorage } from "@/site/search/recent-searches"
import { forgetRecent, readRecent, rememberRecent } from "@/site/search/recent-searches"
import type { SearchOption } from "@/site/search/search-types"

const KEY = "courier:recent-searches"

function memoryStorage(initial?: string): RecentStorage & { kept: Map<string, string> } {
  const kept = new Map<string, string>(initial === undefined ? [] : [[KEY, initial]])
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
  }
}

function option(href: string, title = href): SearchOption {
  return {
    id: href,
    href,
    title: [{ text: title, matched: false }],
    trail: ["Page"],
    kind: "page",
  }
}

describe("recent results", () => {
  it("keeps an opened result first, as plain text", () => {
    const storage = memoryStorage()

    rememberRecent(storage, {
      ...option("/docs/a"),
      title: [
        { text: "create", matched: false },
        { text: "Proxy", matched: true },
      ],
    })

    expect(readRecent(storage)).toEqual([
      { href: "/docs/a", title: "createProxy", trail: ["Page"], kind: "page" },
    ])
  })

  it("keeps a result once, moving it first when it is opened again", () => {
    const storage = memoryStorage()
    rememberRecent(storage, option("/docs/a"))
    rememberRecent(storage, option("/docs/b"))

    const recent = rememberRecent(storage, option("/docs/a"))

    expect(recent.map((entry) => entry.href)).toEqual(["/docs/a", "/docs/b"])
  })

  it("keeps the six newest", () => {
    const storage = memoryStorage()
    for (const page of ["a", "b", "c", "d", "e", "f", "g"])
      rememberRecent(storage, option(`/docs/${page}`))

    expect(readRecent(storage).map((entry) => entry.href)).toEqual([
      "/docs/g",
      "/docs/f",
      "/docs/e",
      "/docs/d",
      "/docs/c",
      "/docs/b",
    ])
  })

  it("does not keep a result that leads off the site", () => {
    const storage = memoryStorage()

    expect(rememberRecent(storage, option("https://example.com/"))).toEqual([])
    expect(storage.kept.has(KEY)).toBe(false)
  })

  it("forgets every recent result", () => {
    const storage = memoryStorage()
    rememberRecent(storage, option("/docs/a"))

    expect(forgetRecent(storage)).toEqual([])
    expect(readRecent(storage)).toEqual([])
  })
})

describe("recent results read from storage the reader can change", () => {
  it("takes nothing from storage that is not JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    expect(readRecent(memoryStorage("{not json"))).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it("takes only entries of the right shape that lead to a page of the site", () => {
    const stored = JSON.stringify([
      { href: "/docs/a", title: "A", trail: [], kind: "page" },
      { href: "javascript:alert(1)", title: "x", trail: [], kind: "page" },
      { href: "//evil.example/", title: "x", trail: [], kind: "page" },
      { href: "/\\evil.example/", title: "x", trail: [], kind: "page" },
      { href: "/docs/b", title: 1, trail: [], kind: "page" },
      { href: "/docs/c", title: "C", trail: [2], kind: "page" },
      { href: "/docs/d", title: "D", trail: [], kind: "script" },
      null,
      "text",
    ])

    expect(readRecent(memoryStorage(stored)).map((entry) => entry.href)).toEqual(["/docs/a"])
  })

  it("takes nothing from storage that holds no list", () => {
    expect(readRecent(memoryStorage(JSON.stringify({ href: "/docs/a" })))).toEqual([])
  })

  it("keeps nothing, and breaks nothing, where the browser refuses storage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const refusing: RecentStorage = {
      getItem: () => {
        throw new Error("SecurityError")
      },
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
    }

    expect(readRecent(refusing)).toEqual([])
    expect(rememberRecent(refusing, option("/docs/a"))).toHaveLength(1)
    expect(readRecent(undefined)).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
