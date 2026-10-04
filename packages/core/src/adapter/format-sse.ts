import { ConfigurationError } from "../errors";
import { SSE_CONTROL_EVENTS } from "../realtime/sse/control-events";
import type { SSEEvent } from "../realtime/types";

/** Standard SSE response headers */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * Build CORS headers for cross-origin SSE responses.
 * Pass the result as `sseHeaders` in HandlerConfig.
 *
 * Includes `Vary: Origin` (required by CORS spec when origin is not `*`),
 * and `Access-Control-Allow-Credentials` for cookie/auth forwarding.
 *
 * For multiple allowed origins, dynamically pick the requesting origin:
 * ```ts
 * const origin = request.headers.get("Origin") ?? "";
 * const allowed = ["https://app.example.com", "https://admin.example.com"];
 * if (allowed.includes(origin)) {
 *   config.sseHeaders = buildSSECorsHeaders(origin);
 * }
 * ```
 *
 * @param origin - Allowed origin (e.g. "https://app.example.com")
 * @param credentials - Include credentials header (default: true)
 * @returns CORS header record to spread into sseHeaders config
 *
 * @example
 * createHandler({
 *   sources,
 *   sseHeaders: buildSSECorsHeaders("https://app.example.com"),
 * });
 */
export function buildSSECorsHeaders(origin: string, credentials = true): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
  if (credentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

/**
 * Format an endpoint's SSE event into wire format (text/event-stream).
 *
 * @throws ConfigurationError when the event name is reserved for the
 *   stream's own end-of-stream events
 */
export function formatSSEEvent<TData>(event: SSEEvent<TData>, seq?: number): string {
  if (event.event?.startsWith(SSE_CONTROL_EVENTS.prefix)) {
    throw new ConfigurationError(
      "RESERVED_SSE_EVENT",
      `SSE event name "${event.event}" is reserved: names starting with "${SSE_CONTROL_EVENTS.prefix}" tell the client how the stream ended`,
    );
  }
  const lines: string[] = [];

  const id = event.id ?? (seq !== undefined ? String(seq) : undefined);
  if (id !== undefined) lines.push(`id: ${sanitizeField(id)}`);
  if (event.event) lines.push(`event: ${sanitizeField(event.event)}`);
  if (event.retry !== undefined) lines.push(`retry: ${event.retry}`);

  /* Always JSON, strings included: the client reads every event as JSON,
     so a string written raw would be dropped ("hello") or come back as
     another type ("42" as a number). JSON also keeps the payload on one
     line. */
  lines.push(`data: ${JSON.stringify(event.data ?? null)}`);

  return `${lines.join("\n")}\n\n`;
}

/** SSE heartbeat comment — keeps connection alive through proxies */
export const SSE_HEARTBEAT = ": ping\n\n";

const NEWLINE_RE = /[\n\r]/g;

/** Strip newlines from SSE field values to prevent injection */
function sanitizeField(value: string): string {
  return value.replace(NEWLINE_RE, "");
}
