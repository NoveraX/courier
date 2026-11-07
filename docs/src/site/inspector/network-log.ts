import { traceOfTiming } from "./seen-trace"
import type { CallTrace, TimingMetric } from "./trace"

/** The parts of the browser's record of a request — a `PerformanceResourceTiming` — the log reads. */
export interface ResourceEntry {
  readonly name: string
  readonly initiatorType: string
  readonly startTime: number
  readonly duration: number
  readonly transferSize: number
  readonly encodedBodySize: number
  readonly nextHopProtocol: string
  /** The answer's status, where the engine records it: WebKit does not. */
  readonly responseStatus?: number | undefined
  readonly serverTiming: readonly TimingMetric[]
}

/** A request the page made, as the browser recorded it, with what the site's server told of it. */
export interface SeenRequest {
  /** Which of the page's requests it was, in the order the browser recorded them. */
  readonly key: number
  /** The path of the page that made it: a page the visitor left keeps its requests apart. */
  readonly page: string
  /** The call it carried, as `api.users.create`: a request of the proxy route's alone. */
  readonly call?: string | undefined
  /** Whether it was a Server Action's: a POST to the page's own address. */
  readonly action: boolean
  /** Its address's path and query. */
  readonly target: string
  /** When it was sent, in ms after the page began to load. */
  readonly start: number
  /** How long it took, in ms, its answer read to the end. */
  readonly ms: number
  /** The answer's status, as the engine or the site's server says it. */
  readonly status?: number | undefined
  /** How many bytes came over the network for it. */
  readonly bytes: number
  /** Whether the browser's cache answered it, so nothing was sent. */
  readonly cached: boolean
  /** Whether no answer reached the browser: it was cancelled, or it failed. */
  readonly unanswered: boolean
  /** What sent it: `fetch`, or `xmlhttprequest` for an upload with progress. */
  readonly via: string
  readonly protocol: string
  /** What the site's server told of the call, in the answer's `Server-Timing`. */
  readonly trace?: CallTrace | undefined
  /** What on the page sent it — a sandbox's control — or `undefined` where the page sent it itself. */
  readonly cause?: unknown
}

/* The proxy route's own address, whose requests name the call they carry. */
const PROXY_PATH = "/api/request"

/* The call a proxy request's address names, as `api.users.create`. */
function callOf(url: URL): string | undefined {
  const parts = ["_s", "_g", "_m"].flatMap((key) => url.searchParams.get(key) ?? [])
  return parts.length >= 2 ? parts.join(".") : undefined
}

/**
 * A request of the page's, as the browser recorded it — or `undefined`
 * for one the inspector does not show: another site's, a script's, an
 * image's. A proxy request names its call in its address; a POST to the
 * page's own address is a Server Action's. The answer's status is the
 * engine's where it records one, else the site's server's, and an answer
 * with no bytes over the network that has a body came from the cache.
 *
 * @param entry - The browser's record
 * @param page - The page's origin and path
 * @param key - Which of the page's requests it is
 * @returns The request, or `undefined`
 * @example
 * ```ts
 * seenRequestOf(entry, window.location, 7)
 * ```
 */
export function seenRequestOf(
  entry: ResourceEntry,
  page: { readonly origin: string; readonly pathname: string },
  key: number
): SeenRequest | undefined {
  let url: URL
  try {
    url = new URL(entry.name)
  } catch {
    return undefined
  }
  if (url.origin !== page.origin) return undefined
  const proxied = url.pathname === PROXY_PATH
  const action =
    !proxied && entry.initiatorType === "fetch" && url.pathname === page.pathname && !url.search
  if (!proxied && !action) return undefined
  const trace = traceOfTiming(entry.serverTiming)
  const recorded = entry.responseStatus
  const status = recorded !== undefined && recorded > 0 ? recorded : trace?.status
  return {
    key,
    page: page.pathname,
    call: proxied ? callOf(url) : undefined,
    action,
    target: `${url.pathname}${url.search}`,
    start: entry.startTime,
    ms: entry.duration,
    ...(status !== undefined && { status }),
    bytes: entry.transferSize,
    cached: entry.transferSize === 0 && entry.encodedBodySize > 0,
    unanswered: recorded === 0 && entry.serverTiming.length === 0,
    via: entry.initiatorType,
    protocol: entry.nextHopProtocol,
    ...(trace !== undefined && { trace }),
  }
}

/**
 * The requests a page made, as {@link seenRequestOf} reads them, the
 * latest `most` of them: an older one goes as a newer one comes. A request
 * whose answer has the id of one already seen was answered from the
 * browser's cache, whichever engine records it. Each is told what caused
 * it, by when it was sent.
 */
export class NetworkLog {
  #requests: readonly SeenRequest[] = []
  #count = 0
  readonly #listeners = new Set<() => void>()

  /**
   * @param most - The most requests kept
   */
  constructor(readonly most = 100) {}

  /** The requests kept, oldest first: the same list until another comes. */
  get requests(): readonly SeenRequest[] {
    return this.#requests
  }

  /**
   * Take in the browser's records, keeping those of requests the inspector shows.
   *
   * @param entries - The records
   * @param page - The page's origin and path
   * @param causeOf - What on the page caused a request sent at a time, if anything did
   */
  add(
    entries: Iterable<ResourceEntry>,
    page: { origin: string; pathname: string },
    causeOf: (start: number) => unknown = () => undefined
  ): void {
    const added: SeenRequest[] = []
    for (const entry of entries) {
      const request = seenRequestOf(entry, page, this.#count)
      if (request === undefined) continue
      this.#count += 1
      const rid = request.trace?.rid
      const seen =
        rid !== undefined && [...this.#requests, ...added].some((r) => r.trace?.rid === rid)
      const cause = causeOf(request.start)
      added.push({
        ...request,
        ...(seen && { cached: true }),
        ...(cause !== undefined && { cause }),
      })
    }
    if (added.length === 0) return
    this.#requests = [...this.#requests, ...added].slice(-this.most)
    for (const listener of this.#listeners) listener()
  }

  /** Be told whenever a request is added; the returned function stops it. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }
}
