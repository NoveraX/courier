import type { RequestEntry } from "../../store"

// ── Build cURL command ───────────────────────────────────────────────────────

export function buildCurl(request: RequestEntry): string {
  const method = request.httpMethod ?? "GET"
  const url =
    request.url ??
    `[${request.source}] ${[request.source, request.group, request.method].filter(Boolean).join(".")}`
  let curl = `curl -X ${method} '${url}'`

  if (request.requestHeaders) {
    for (const [k, v] of Object.entries(request.requestHeaders)) {
      curl += ` \\\n  -H '${k}: ${v}'`
    }
  }
  if (request.variables && method !== "GET") {
    curl += ` \\\n  -d '${JSON.stringify(request.variables)}'`
  }
  return curl
}

// ── Build fetch snippet ──────────────────────────────────────────────────────

export function buildFetchSnippet(request: RequestEntry): string {
  const method = request.httpMethod ?? "GET"
  const url = request.url ?? "/api/request"
  const opts: string[] = []

  if (method !== "GET") opts.push(`  method: "${method}"`)
  if (request.requestHeaders && Object.keys(request.requestHeaders).length > 0) {
    opts.push(
      `  headers: ${JSON.stringify(request.requestHeaders, null, 2).replace(/\n/g, "\n  ")}`,
    )
  }
  if (request.variables && method !== "GET") {
    opts.push(
      `  body: JSON.stringify(${JSON.stringify(request.variables, null, 2).replace(/\n/g, "\n  ")})`,
    )
  }
  if (opts.length === 0) return `fetch("${url}")`
  return `fetch("${url}", {\n${opts.join(",\n")}\n})`
}

// ── Export request as JSON ───────────────────────────────────────────────────

export function exportRequestAsJson(request: RequestEntry): string {
  return JSON.stringify(
    {
      id: request.id,
      source: request.source,
      group: request.group,
      method: request.method,
      httpMethod: request.httpMethod,
      url: request.url,
      mode: request.mode,
      type: request.type,
      status: request.status,
      statusCode: request.statusCode,
      variables: request.variables,
      data: request.data,
      requestHeaders: request.requestHeaders,
      headers: request.headers,
      timing: request.timing,
      size: request.size,
      error: request.error,
      startedAt: request.startedAt,
    },
    null,
    2,
  )
}

// ── Request label builder ────────────────────────────────────────────────────

export function getRequestLabel(request: RequestEntry): string {
  return [request.source, request.group, request.method].filter(Boolean).join(".")
}

// ── Error suggestions ────────────────────────────────────────────────────────

export function getErrorSuggestions(
  error: NonNullable<RequestEntry["error"]>,
): string[] {
  const suggestions: string[] = []

  switch (error.type) {
    case "ValidationError":
      suggestions.push("Check that the request variables match the endpoint schema")
      suggestions.push("Open the Payload tab to compare original vs validated data")
      break
    case "AbortError":
      suggestions.push("The request was cancelled — check abort signals or timeout config")
      suggestions.push("Consider increasing the timeout in middleware or endpoint options")
      break
    case "HTTPError":
      if (error.status === 401)
        suggestions.push("Auth token may be expired — check authMiddleware config")
      if (error.status === 403) suggestions.push("Check authorization rules on the backend")
      if (error.status === 404)
        suggestions.push("Verify the endpoint URL and path params are correct")
      if (error.status === 429)
        suggestions.push("Rate limited — check rateLimitMiddleware config")
      if (error.status && error.status >= 500)
        suggestions.push("Server error — check backend logs for details")
      break
    case "NetworkError":
      suggestions.push("Check that the backend is running and accessible")
      suggestions.push("Verify CORS settings if using proxy mode")
      break
    default:
      suggestions.push("Check the error message for details")
  }

  return suggestions
}
