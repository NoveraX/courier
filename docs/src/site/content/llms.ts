import { docsNav } from "./docs-nav"

/**
 * What the llms files are served with: plain text, kept out of search
 * results — they repeat the docs pages, which are what a search should find.
 */
export const LLMS_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "x-robots-tag": "noindex",
} as const

/**
 * The docs as llms.txt: what Courier is, then every page by section — a
 * link and what the page covers — so an agent knows where to read. A page
 * written as text is linked as Markdown, at its address with `.md` after
 * it; a live example, which runs only in a browser, as its page.
 *
 * @param siteUrl - Where the site is published
 * @param describe - The description of the page at an address
 * @param asMarkdown - Whether the page at an address is served as Markdown
 * @returns The file
 * @example
 * ```ts
 * llmsIndex("https://courier.noverax.cloud", (href) => descriptions.get(href) ?? "", (href) => descriptions.has(href))
 * ```
 */
export function llmsIndex(
  siteUrl: string,
  describe: (href: string) => string,
  asMarkdown: (href: string) => boolean
): string {
  const sections = docsNav.map(({ label, items }) => {
    const links = items.map((item) => {
      const about = item.description ?? describe(item.href)
      const link = `${siteUrl}${item.href}${asMarkdown(item.href) ? ".md" : ""}`
      return `- [${item.title}](${link})${about ? `: ${about}` : ""}`
    })
    return [`## ${label}`, "", ...links].join("\n")
  })
  return [
    "# @noverax/courier",
    "",
    "> One typed API definition for every caller: browser code through a proxy, server code directly, React Query hooks, streams and channels — with Studio to inspect, mock and import APIs in development.",
    "",
    `The whole documentation as one Markdown file: ${siteUrl}/llms-full.txt`,
    "",
    "Every docs page is served as Markdown too, at its address with .md after it, as the links below are.",
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n")
}
