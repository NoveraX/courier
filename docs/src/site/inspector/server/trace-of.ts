import type { CallSite, CallTrace } from "../trace"
import type { CallLog } from "./call-log"
import { bodyLine, headerNames } from "./header-names"

/* The parameters of the route's address the proxy reads to name the call and how it goes. */
const ROUTING = ["_s", "_g", "_m", "_transport"]

/* The route's address as the trace tells it: its path, and of its query what the proxy reads to
   name the call, the first of each as the proxy reads it. Whatever else the address held — a
   parameter no request carries on, which may hold anything, its name too — is left out. */
function routeTarget(url: URL): string {
  const kept = new URLSearchParams()
  for (const key of ROUTING) {
    const value = url.searchParams.get(key)
    if (value !== null) kept.set(key, value)
  }
  const query = kept.toString()
  return query === "" ? url.pathname : `${url.pathname}?${query}`
}

/* What a log tells of the call itself, wherever the call was made. */
function callParts(log: CallLog) {
  return {
    ...(log.variables !== undefined && { variables: log.variables }),
    attempts: [...log.attempts],
    sent: [...log.sentHeaders],
    answered: [...log.answerHeaders],
    chain: log.chain.map(({ index: _, ...link }) => link),
    log: [...log.lines],
    cache: [...log.cacheWords],
  }
}

/**
 * The trace of a call the site's proxy route served: how the browser's
 * request reached it — method, path and the call its query names, the
 * names of its headers, the type and length of its body — what the log
 * kept of the call, and how
 * the route answered: its status, the names of the headers it answered
 * with, and the id the core gave the call. Neither the request's body nor
 * the answer's is read.
 *
 * @param log - What the server kept of the call
 * @param request - The browser's request
 * @param response - The route's answer
 * @returns The trace
 * @example
 * ```ts
 * const trace = proxyTraceOf(log, request, response)
 * ```
 */
export function proxyTraceOf(log: CallLog, request: Request, response: Response): CallTrace {
  const received = headerNames(request.headers)
  const passedBack = headerNames(response.headers)
  const body = bodyLine(request)
  const rid = response.headers.get("x-courier-rid")
  return {
    site: "proxy",
    ...(rid !== null && { rid }),
    received: {
      method: request.method,
      target: routeTarget(new URL(request.url)),
      headers: received.names,
      ...(body !== undefined && { body }),
    },
    ...callParts(log),
    status: response.status,
    passedBack: passedBack.names,
    cut: log.cut + received.cut + passedBack.cut,
  }
}

/**
 * The trace of a call made on the site's server, as a page rendered or in
 * a Server Action: what the log kept of it, how long it took, and the
 * status of the API's last answer, where it answered.
 *
 * @param log - What the server kept of the call
 * @param site - Where the call was made
 * @returns The trace
 * @example
 * ```ts
 * const trace = serverTraceOf(log, "render")
 * ```
 */
export function serverTraceOf(log: CallLog, site: Exclude<CallSite, "proxy">): CallTrace {
  const last = log.attempts.at(-1)?.outcome
  return {
    site,
    ...callParts(log),
    ...(last !== undefined && /^\d{3}$/.test(last) && { status: Number(last) }),
    ms: log.now() - log.start,
    passedBack: [],
    cut: log.cut,
  }
}
