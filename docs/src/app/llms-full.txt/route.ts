import { loadDoc } from "@/site/content/doc-module"
import { docSource } from "@/site/content/docs-files"
import { flatNavItems } from "@/site/content/docs-nav"
import { LLMS_HEADERS } from "@/site/content/llms"
import { pageMarkdown } from "@/site/content/page-markdown"

export const dynamic = "force-static"

/* Every page the navigation lists that is written as content, in its order. */
export async function GET(): Promise<Response> {
  const pages = await Promise.all(
    flatNavItems().map(async ({ href }) => {
      const slug = href.replace(/^\/docs\//, "").split("/")
      const source = docSource(slug)
      if (!source) return null
      const { meta } = await loadDoc(slug)
      return pageMarkdown(source, meta.title, meta.description)
    })
  )
  const text = pages.filter((page): page is string => page !== null).join("\n---\n\n")
  return new Response(text, { headers: LLMS_HEADERS })
}
