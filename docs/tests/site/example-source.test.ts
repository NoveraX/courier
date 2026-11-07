/**
 * Each live examples page links to its code: the page's own folder of the
 * repository, on GitHub — one that is there, so a renamed folder fails
 * here rather than on a reader's click.
 */
import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { EXAMPLE_PAGES, type ExampleName, exampleSource } from "@/site/sandbox/example-pages"

describe("an examples page's code", () => {
  it("is its own folder of the repository, on GitHub", () => {
    for (const name of Object.keys(EXAMPLE_PAGES) as ExampleName[]) {
      expect(exampleSource(name)).toBe(
        `https://github.com/NoveraX/courier/tree/master/docs/src/app/docs/examples/${name}`
      )
      const page = new URL(`../../src/app/docs/examples/${name}/page.tsx`, import.meta.url)
      expect(existsSync(page), name).toBe(true)
    }
  })
})
