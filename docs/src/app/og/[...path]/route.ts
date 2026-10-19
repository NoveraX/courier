import { ogCard } from "@/site/seo/og-card"
import { pageCards } from "@/site/seo/page-cards"

/* Every card is drawn once, when the site is built; an address no page has is not found. */
export const dynamic = "force-static"
export const dynamicParams = false

interface CardContext {
  params: Promise<{ path: string[] }>
}

export function generateStaticParams(): { path: string[] }[] {
  return [...pageCards().keys()].map((href) => ({ path: href.slice(1).split("/") }))
}

export async function GET(_request: Request, { params }: CardContext): Promise<Response> {
  const { path } = await params
  const href = `/${path.join("/")}`
  const card = pageCards().get(href)
  if (!card) return new Response("Not found", { status: 404 })
  return ogCard(card, href)
}
