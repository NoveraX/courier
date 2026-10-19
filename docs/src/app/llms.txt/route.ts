import { loadDoc } from "@/site/content/doc-module"
import { docSlugs } from "@/site/content/docs-files"
import { LLMS_HEADERS, llmsIndex } from "@/site/content/llms"
import { SITE_URL } from "@/site/site-url"

export const dynamic = "force-static"

export async function GET(): Promise<Response> {
  const pages = await Promise.all(
    docSlugs().map(
      async (slug): Promise<[string, string]> => [
        `/docs/${slug.join("/")}`,
        (await loadDoc(slug)).meta.description,
      ]
    )
  )
  const described = new Map(pages)
  const text = llmsIndex(
    SITE_URL,
    (href) => described.get(href) ?? "",
    (href) => described.has(href)
  )
  return new Response(text, { headers: LLMS_HEADERS })
}
