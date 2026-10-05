/**
 * Code typed a character at a time on the landing page is cut from its
 * highlighted runs, so the runs must carry the site's code colours and cut
 * cleanly at any count.
 */
import { describe, expect, it } from "vitest"

import { highlightTokens, sliceTokens } from "@/site/code/highlight-tokens"

describe("highlighted runs", () => {
  it("paints a line's runs in the site's code colours", async () => {
    const [line] = await highlightTokens(
      'const user = await caller.users.getById({ id: "5" })',
      "ts"
    )

    expect(line?.find((t) => t.text === "const")?.tone).toBe("keyword")
    expect(line?.find((t) => t.text === "getById")?.tone).toBe("function")
    expect(line?.map((t) => t.text).join("")).toBe(
      'const user = await caller.users.getById({ id: "5" })'
    )
  })

  it("keeps one array per line, an empty line included", async () => {
    const lines = await highlightTokens("const a = 1\n\nconst b = 2", "ts")

    expect(lines).toHaveLength(3)
    expect(lines[1]).toEqual([])
  })

  it("cuts a line inside a run, keeping the run's colour", () => {
    const line = [
      { text: "const", tone: "keyword" as const },
      { text: " user", tone: "plain" as const },
    ]

    expect(sliceTokens(line, 8)).toEqual([
      { text: "const", tone: "keyword" },
      { text: " us", tone: "plain" },
    ])
    expect(sliceTokens(line, 0)).toEqual([])
    expect(sliceTokens(line, 99)).toEqual(line)
  })
})
