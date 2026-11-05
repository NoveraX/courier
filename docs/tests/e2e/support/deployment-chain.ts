import type { IncomingHttpHeaders } from "node:http"

/** The DDoS filter's edge the stand's requests leave from, and the network the site trusts it by. */
export const FILTER_EDGE = "203.0.113.10"
export const FILTER_NETWORK = "203.0.113.0/24"

/** The header the filter names the visitor in, as DDoS-Guard's `DDG-Connecting-IP` does. */
export const FILTER_HEADER = "ddg-connecting-ip"

/** How a request reaches Traefik: from the DDoS filter, as a visitor's does, or past it, from one who found the server's own address. */
export type Route = "filter" | "direct"

/* The headers Traefik manages: from a peer it does not trust — Dokploy's Traefik trusts none — it
   drops every one it was sent, then writes its own. */
const TRAEFIK_MANAGED = /^x-forwarded-|^x-real-ip$/

/**
 * The headers the site's server gets for a request, as the chain before
 * it in production writes them. DDoS-Guard appends the visitor's address
 * to `X-Forwarded-For` and names them in `DDG-Connecting-IP`, whatever the
 * visitor sent in either. Traefik, trusting no peer's `X-Forwarded-*`,
 * drops those it was sent and names its own peer — the filter's edge, or
 * the visitor who went around the filter — and passes `DDG-Connecting-IP`
 * on as it came.
 *
 * @param sent - The headers the visitor's browser sent
 * @param route - Whether the request came through the filter or around it
 * @param visitor - The visitor's address
 * @returns The headers the site's server gets
 * @example
 * ```ts
 * chainHeaders({ "x-forwarded-for": "192.0.2.1" }, "filter", "198.51.100.7")
 * // { "ddg-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.10", … }
 * ```
 */
export function chainHeaders(
  sent: IncomingHttpHeaders,
  route: Route,
  visitor: string
): IncomingHttpHeaders {
  const filtered: IncomingHttpHeaders =
    route === "filter"
      ? {
          ...sent,
          [FILTER_HEADER]: visitor,
          "x-forwarded-for": [sent["x-forwarded-for"], visitor].filter(Boolean).join(", "),
        }
      : sent
  const peer = route === "filter" ? FILTER_EDGE : visitor
  const kept = Object.fromEntries(
    Object.entries(filtered).filter(([name]) => !TRAEFIK_MANAGED.test(name))
  )
  return {
    ...kept,
    "x-forwarded-for": peer,
    "x-real-ip": peer,
    "x-forwarded-proto": "https",
    "x-forwarded-host": sent.host,
  }
}
