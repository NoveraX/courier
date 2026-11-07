import { recordCalls, withCallLog } from "@/site/inspector/server/recorder"
import { proxyTraceOf } from "@/site/inspector/server/trace-of"
import { formatServerTiming } from "@/site/inspector/server-timing"
import { traceMetrics } from "@/site/inspector/trace-metrics"

type Handler<TRequest extends Request> = (request: TRequest) => Promise<Response>

/* The answer with the site's metrics after the core's in its `Server-Timing`: as it is, where its
   headers may still change, or as a copy around the same body. */
function withServerTiming(response: Response, metrics: string): Response {
  if (metrics === "") return response
  try {
    response.headers.append("Server-Timing", metrics)
    return response
  } catch {
    const headers = new Headers(response.headers)
    headers.append("Server-Timing", metrics)
    const { status, statusText } = response
    return new Response(response.body, { status, statusText, headers })
  }
}

function inspected<TRequest extends Request>(handle: Handler<TRequest>): Handler<TRequest> {
  return async (request) => {
    const { value: response, log } = await withCallLog(() => handle(request))
    const trace = proxyTraceOf(log, request, response)
    return withServerTiming(response, formatServerTiming(traceMetrics(trace)))
  }
}

/**
 * The proxy route's handlers, each telling the page what the site's
 * server saw of the call it served — how the request arrived, each request
 * to the API, the chain, how it answered — in its answer's
 * `Server-Timing`, which the browser hands the page. Neither the request's
 * body nor the answer's is read or held: the trace is made of the core's
 * events and the headers' names. Off, the handlers are as they were.
 *
 * @param handlers - The route's handlers, by HTTP method
 * @param on - Whether the inspector is on: the site's setting
 * @returns The handlers
 * @example
 * ```ts
 * export const { GET, POST } = inspectedRoute(apiRoute(EXAMPLES_PROXY), requestInspection(process.env))
 * ```
 */
export function inspectedRoute<TRequest extends Request, TMethod extends string>(
  handlers: Record<TMethod, Handler<TRequest>>,
  on: boolean
): Record<TMethod, Handler<TRequest>> {
  if (!on) return handlers
  recordCalls()
  const wrapped = Object.entries<Handler<TRequest>>(handlers).map(
    ([method, handle]) => [method, inspected(handle)] as const
  )
  return Object.fromEntries(wrapped) as Record<TMethod, Handler<TRequest>>
}
