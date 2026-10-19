/**
 * Every docs page as Markdown, at its address with .md after it: the page
 * as "Copy as Markdown" gives it, pointing search engines at the page.
 */
import { fileURLToPath } from "node:url"

import { describe, expect, it, vi } from "vitest"

import { pageMetadata } from "@/site/seo/page-metadata"

/* The route reads the pages from where the site is built, which its modules take from the
   working directory as they load. */
const cwd = vi
  .spyOn(process, "cwd")
  .mockReturnValue(fileURLToPath(new URL("../..", import.meta.url)))
const { docSlugs } = await import("@/site/content/docs-files")
const { GET, generateStaticParams } = await import("@/app/markdown/[...slug]/route")
cwd.mockRestore()

function request(slug: string[]): Promise<Response> {
  return GET(new Request("https://courier.noverax.cloud/"), { params: Promise.resolve({ slug }) })
}

describe("a docs page as Markdown", () => {
  it("is written for every docs page when the site is built", () => {
    expect(generateStaticParams()).toEqual(docSlugs().map((slug) => ({ slug })))
  })

  it("is the page's text under its title, naming the page itself as canonical", async () => {
    const response = await request(["quick-start"])
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(response.headers.get("link")).toBe(
      '<https://courier.noverax.cloud/docs/quick-start>; rel="canonical"'
    )
    expect((await response.text()).startsWith("# Quick Start\n\nSet Courier up")).toBe(true)
  })

  it("is not found for a page there is not, or an address that climbs out of the docs", async () => {
    expect((await request(["no-such-page"])).status).toBe(404)
    expect((await request(["..", "README"])).status).toBe(404)
  })

  it("is named by the page's metadata, beside its canonical address", () => {
    const metadata = pageMetadata({
      path: "/docs/quick-start",
      title: "Quick Start",
      description: "D",
      markdown: "/docs/quick-start.md",
    })
    expect(metadata.alternates).toEqual({
      canonical: "/docs/quick-start",
      types: { "text/markdown": "/docs/quick-start.md" },
    })
  })
})
