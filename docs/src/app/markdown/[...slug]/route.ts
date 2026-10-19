import { docSlugs, docSource } from "@/site/content/docs-files"
import { pageMarkdown } from "@/site/content/page-markdown"
import { sourceMetadata } from "@/site/content/source-metadata"
import { absoluteUrl } from "@/site/seo/structured-data/json-ld-node"

/* Every docs page as Markdown, written once when the site is built. The address a reader asks
   for is the page's own with .md after it, which next.config rewrites to this route. */
export const dynamic = "force-static"
export const dynamicParams = false

interface MarkdownContext {
  params: Promise<{ slug: string[] }>
}

export function generateStaticParams(): { slug: string[] }[] {
  return docSlugs().map((slug) => ({ slug }))
}

export async function GET(_request: Request, { params }: MarkdownContext): Promise<Response> {
  const { slug } = await params
  const source = docSource(slug)
  if (!source) return new Response("Not found", { status: 404 })
  const { title = "", description = "" } = sourceMetadata(source)
  return new Response(pageMarkdown(source, title, description), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      /* The page itself is what a search should find; this is the same page as text. */
      link: `<${absoluteUrl(`/docs/${slug.join("/")}`)}>; rel="canonical"`,
    },
  })
}
