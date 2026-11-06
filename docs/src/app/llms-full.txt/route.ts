import { docPages } from "@/site/content/docs-files"
import { flatNavItems } from "@/site/content/docs-nav"
import { LLMS_HEADERS } from "@/site/content/llms"
import { pageMarkdown } from "@/site/content/page-markdown"

export const dynamic = "force-static"

/* Every page the navigation lists that is written as content, in its order. */
export function GET(): Response {
  const pages = new Map(docPages().map((page) => [`/docs/${page.slug.join("/")}`, page]))
  const text = flatNavItems()
    .flatMap(({ href }) => {
      const page = pages.get(href)
      return page ? [pageMarkdown(page.source, page.title, page.description)] : []
    })
    .join("\n---\n\n")
  return new Response(text, { headers: LLMS_HEADERS })
}
