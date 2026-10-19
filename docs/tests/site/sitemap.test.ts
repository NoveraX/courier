/**
 * What the site tells crawlers: every page by its canonical address, with
 * only true dates, and where the sitemap is.
 */
import { fileURLToPath } from "node:url"

import { describe, expect, it, vi } from "vitest"

/* The sitemap reads the pages from where the site is built, which their modules take from the
   working directory as they load. */
const cwd = vi
  .spyOn(process, "cwd")
  .mockReturnValue(fileURLToPath(new URL("../..", import.meta.url)))
const { docSlugs, docSource } = await import("@/site/content/docs-files")
const { sourceMetadata } = await import("@/site/content/source-metadata")
const { EXAMPLE_PAGES } = await import("@/site/sandbox/example-pages")
const { sitemapEntries } = await import("@/site/seo/sitemap-entries")
const { default: robots } = await import("@/app/robots")
cwd.mockRestore()

const SITE = "https://courier.noverax.cloud"

describe("the sitemap", () => {
  const entries = sitemapEntries()
  const urls = entries.map((entry) => entry.url)

  it("lists every page once, by its canonical address", () => {
    const docs = docSlugs().map((slug) => `${SITE}/docs/${slug.join("/")}`)
    const examples = Object.keys(EXAMPLE_PAGES).map((name) => `${SITE}/docs/examples/${name}`)
    const landing = [`${SITE}/`, `${SITE}/studio`, `${SITE}/mcp`, `${SITE}/reference`]
    expect(new Set(urls).size).toBe(urls.length)
    expect([...urls].sort()).toEqual([...landing, ...docs, ...examples].sort())
    expect(urls.every((url) => url.startsWith(`${SITE}/`))).toBe(true)
    expect(urls).not.toContain(`${SITE}/docs`)
  })

  it("dates a docs page by its own date, and leaves undated what does not say", () => {
    for (const slug of docSlugs()) {
      const entry = entries.find(({ url }) => url === `${SITE}/docs/${slug.join("/")}`)
      expect(entry?.lastModified).toBe(sourceMetadata(docSource(slug) ?? "").updated)
    }
    expect(entries.find(({ url }) => url === `${SITE}/`)).toEqual({ url: `${SITE}/` })
    expect(entries.find(({ url }) => url.endsWith("/docs/examples/basic"))?.lastModified).toBe(
      undefined
    )
  })

  it("dates the API reference by the newest API page it reads", () => {
    const api = docSlugs().filter((slug) => slug[0] === "api")
    const newest = api
      .map((slug) => sourceMetadata(docSource(slug) ?? "").updated ?? "")
      .sort()
      .at(-1)
    expect(entries.find(({ url }) => url === `${SITE}/reference`)?.lastModified).toBe(newest)
  })

  it("sets no change frequency or priority, which search engines ignore", () => {
    for (const entry of entries) {
      expect(entry).not.toHaveProperty("changeFrequency")
      expect(entry).not.toHaveProperty("priority")
    }
  })
})

describe("robots.txt", () => {
  it("lets every page be crawled but the routes they call, and names the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: `${SITE}/sitemap.xml`,
    })
  })
})
