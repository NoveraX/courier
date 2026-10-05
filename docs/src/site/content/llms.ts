import { docsNav } from "./docs-nav"

/**
 * The docs as llms.txt: what Courier is, then every page by section — a
 * link and what the page covers — so an agent knows where to read.
 *
 * @param siteUrl - Where the site is published
 * @param describe - The description of the page at an address
 * @returns The file
 * @example
 * ```ts
 * llmsIndex("https://courier.noverax.cloud", (href) => descriptions.get(href) ?? "")
 * ```
 */
export function llmsIndex(siteUrl: string, describe: (href: string) => string): string {
  const sections = docsNav.map(({ label, items }) => {
    const links = items.map((item) => {
      const about = item.description ?? describe(item.href)
      return `- [${item.title}](${siteUrl}${item.href})${about ? `: ${about}` : ""}`
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
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n")
}
