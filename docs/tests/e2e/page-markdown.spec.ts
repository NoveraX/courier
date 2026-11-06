/**
 * A docs page as Markdown, at its own address, for a request whose Accept
 * asks for it: the same Markdown its address with `.md` after it serves,
 * saying it varies by Accept and kept from shared caches, while a browser
 * is answered with the page — even one that sends the proxy's mark
 * itself. A live example, which has no Markdown, answers with its page
 * whatever is asked.
 */
import { expect, test } from "./support/fixtures"

/* The header by which the site's proxy marks a request as asking for Markdown: its MARKDOWN_ASKED. */
const MARKDOWN_ASKED = "x-docs-markdown"
const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

test("answers a docs page in Markdown to a request that asks for it, and the page to a browser", async ({
  page,
}) => {
  await page.goto("/")
  const asked = await page.request.get("/docs/quick-start", {
    headers: { accept: "text/markdown" },
  })
  const markdown = await page.request.get("/docs/quick-start.md")
  expect(asked.status()).toBe(200)
  expect(asked.headers()["content-type"]).toBe("text/markdown; charset=utf-8")
  expect(asked.headers().vary?.split(/,\s*/)).toContain("Accept")
  expect(asked.headers()["cache-control"]).toBe("private, no-cache")
  expect(await asked.text()).toBe(await markdown.text())

  const browsers: Record<string, string>[] = [
    { accept: BROWSER },
    { accept: BROWSER, [MARKDOWN_ASKED]: "1" },
  ]
  for (const headers of browsers) {
    const browsed = await page.request.get("/docs/quick-start", { headers })
    expect(browsed.status()).toBe(200)
    expect(browsed.headers()["content-type"]).toContain("text/html")
  }

  const example = await page.request.get("/docs/examples/basic", {
    headers: { accept: "text/markdown" },
  })
  expect(example.headers()["content-type"]).toContain("text/html")
})
