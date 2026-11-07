import { AsyncLocalStorage } from "node:async_hooks"
import { studioHooks } from "@noverax/courier/internal"

import { CallLog } from "./call-log"

type Hooks = typeof studioHooks

/* One scope and one set of listeners in the process: Next may load this module in more than one
   bundle — the proxy route's, a page's, a Server Action's — and each copy must find the same. */
const SHARED = Symbol.for("courier-docs.inspector.recorder")

interface Shared {
  readonly scope: AsyncLocalStorage<CallLog>
  restore?: (() => void) | undefined
}

function shared(): Shared {
  const found: unknown = Reflect.get(globalThis, SHARED)
  if (typeof found === "object" && found !== null && "scope" in found) return found as Shared
  const made: Shared = { scope: new AsyncLocalStorage<CallLog>() }
  Reflect.set(globalThis, SHARED, made)
  return made
}

/* The log of the call being served here, if one is being kept. */
const here = (): CallLog | undefined => shared().scope.getStore()

/* What each of the core's events adds to the log of the call it is about. */
const LISTENERS = {
  /* Listening at all is what has the core measure its calls and say so in its answers. */
  onRequestStart: () => {},
  onProxyParse: (event) => here()?.parsed(event.variables),
  onHttpFetchStart: (event) => here()?.fetchStarted(event.method, event.url),
  onHttpFetchEnd: (event) => here()?.fetchEnded(event.status),
  onHttpFetchError: (event) => here()?.fetchFailed(event.status, event.message),
  onRequestEnd: (event) => here()?.answered(event.requestHeaders, event.headers),
  onRequestError: (event) => here()?.answered(undefined, event.headers),
  onMiddlewareExit: (event) =>
    here()?.link(event.name, event.index, event.phase, event.duration, event.headersAdded),
  onCacheHit: (event) => here()?.cache(`hit ${Math.round(event.age)}`),
  onCacheMiss: () => here()?.cache("miss"),
  onCacheStore: (event) => here()?.cache(`store ${Math.round(event.ttl)}`),
} satisfies { [TName in keyof Hooks]?: NonNullable<Hooks[TName]> }

type Listener = (event: never) => void

/* Listen on one of the core's hooks after whatever listened there already: a listener of the
   site's that throws loses the log an event, never the call one. */
function listen(name: keyof typeof LISTENERS): () => void {
  const hooks = studioHooks as unknown as Record<string, Listener | undefined>
  const before = hooks[name]
  const ours = LISTENERS[name] as Listener
  const listener: Listener = (event) => {
    try {
      before?.(event)
    } finally {
      try {
        ours(event)
      } catch {
        const log = here()
        if (log) log.cut += 1
      }
    }
  }
  hooks[name] = listener
  return () => {
    if (hooks[name] === listener) hooks[name] = before
  }
}

/**
 * Have the site's server keep a log of each call it serves inside
 * {@link withCallLog}, from the core's events — the ones Studio is told —
 * and have the core measure its calls and name them in its answers'
 * `Server-Timing` and `X-Courier-Rid`. It listens once in the process,
 * after any listener already there; calls made outside a log cost the
 * listeners nothing.
 *
 * @returns What stops the listening, where this call started it
 * @example
 * ```ts
 * recordCalls()
 * ```
 */
export function recordCalls(): () => void {
  const state = shared()
  if (state.restore !== undefined) return () => {}
  const stops = (Object.keys(LISTENERS) as (keyof typeof LISTENERS)[]).map(listen)
  state.restore = () => {
    for (const stop of stops) stop()
    state.restore = undefined
  }
  return state.restore
}

/**
 * Run `run` with a log of the call it serves kept, and hand the log back
 * with what `run` came to.
 *
 * @param run - What serves the call: the proxy's handler, or the call itself
 * @param now - The log's clock, in ms
 * @returns What `run` came to, and the log
 * @example
 * ```ts
 * const { value: response, log } = await withCallLog(() => handle(request))
 * ```
 */
export async function withCallLog<TValue>(
  run: () => Promise<TValue>,
  now?: () => number
): Promise<{ value: TValue; log: CallLog }> {
  const log = new CallLog(now)
  const value = await shared().scope.run(log, run)
  return { value, log }
}

/**
 * Add a line to the log of the call being served — as a middleware's
 * `logger` takes it — or drop it where no log is kept, so a visitor's
 * calls write nothing to the server's own log.
 *
 * @param line - The line
 * @example
 * ```ts
 * logMiddleware({ logger: traceLine })
 * ```
 */
export function traceLine(line: string): void {
  here()?.line(line)
}
