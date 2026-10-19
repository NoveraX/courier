/**
 * Where the docs' search reads from: the Algolia application DocSearch
 * crawls the site into, and the index it fills. The key can only read the
 * index, which holds what the pages already show, so it is published with
 * them, as Algolia intends a search key to be.
 */
export const DOCSEARCH = {
  appId: "7EBPW3SD96",
  apiKey: "9e05d68aec067f1065814a5ab1f32108",
  indexName: "Docs",
} as const

/**
 * Where "Search by Algolia" leads, as the DocSearch program asks every
 * search it powers to say.
 *
 * @param host - The host the search runs on, which Algolia counts the visit from
 * @returns The address
 * @example
 * ```ts
 * algoliaReferral("courier.noverax.cloud")
 * // "https://www.algolia.com/ref/docsearch/?utm_source=courier.noverax.cloud&…"
 * ```
 */
export function algoliaReferral(host: string): string {
  const params = new URLSearchParams({
    utm_source: host,
    utm_medium: "referral",
    utm_content: "powered_by",
    utm_campaign: "docsearch",
  })
  return `https://www.algolia.com/ref/docsearch/?${params}`
}
