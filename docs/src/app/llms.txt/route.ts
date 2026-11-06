import { docPages } from "@/site/content/docs-files"
import { LLMS_HEADERS, llmsIndex } from "@/site/content/llms"
import { SITE_URL } from "@/site/site-url"

export const dynamic = "force-static"

export function GET(): Response {
  const described = new Map(
    docPages().map((page) => [`/docs/${page.slug.join("/")}`, page.description])
  )
  const text = llmsIndex(
    SITE_URL,
    (href) => described.get(href) ?? "",
    (href) => described.has(href)
  )
  return new Response(text, { headers: LLMS_HEADERS })
}
