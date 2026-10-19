import { siteSearchEntries } from "@/site/content/site-search"

/* The search index, written once when the site is built; a search engine leaves it out of its results. */
export const dynamic = "force-static"

export async function GET(): Promise<Response> {
  return Response.json(await siteSearchEntries(), { headers: { "x-robots-tag": "noindex" } })
}
