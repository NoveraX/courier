import { loadDoc } from "@/site/content/doc-module"
import { docSlugs } from "@/site/content/docs-files"
import { llmsIndex } from "@/site/content/llms"
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
  return new Response(
    llmsIndex(SITE_URL, (href) => described.get(href) ?? ""),
    {
      headers: { "content-type": "text/plain; charset=utf-8" },
    }
  )
}
