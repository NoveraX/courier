/**
 * Whitelist sanitizers for `playground:execute`, `playground:stream`, and
 * `playground:ws:send` payloads arriving over the studio app socket.
 *
 * The studio server forwards these events from the UI process which is
 * itself a wire boundary — every field is validated here so a corrupt or
 * hostile UI session cannot smuggle non-string values into header maps,
 * crash `executeRequest` with a missing `source`, or pass an unparseable
 * `mode` to the playground executor.
 *
 * Each sanitizer returns `undefined` when required fields are missing or
 * malformed so the caller can short-circuit with a clean error result
 * instead of throwing inside the executor.
 */

export interface PlaygroundExecutePayload {
  source: string;
  group: string;
  method: string;
  variables: unknown;
  headers: Record<string, string>;
  mode: "direct" | "proxy";
}

export interface PlaygroundStreamPayload {
  source: string;
  group: string;
  method: string;
  variables: unknown;
  transport: "sse" | "ws";
  headers?: Record<string, string>;
  mode?: "direct" | "proxy";
}

export interface PlaygroundWSSendPayload {
  requestId: string;
  topic: string;
  data: unknown;
}

/**
 * Strict string-to-string header map validator. Drops any entry whose key
 * or value is not a string and rejects header names containing CR/LF so a
 * malicious UI cannot smuggle a header-injection through the playground
 * executor's `fetch(..., { headers })` call.
 */
function sanitizeHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    if (key.length === 0 || /[\r\n]/.test(key) || /[\r\n]/.test(value)) continue;
    result[key] = value;
  }
  return result;
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

export function sanitizePlaygroundExecutePayload(
  raw: unknown,
): PlaygroundExecutePayload | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (typeof raw.source !== "string" || raw.source.length === 0) return undefined;
  if (typeof raw.group !== "string") return undefined;
  if (typeof raw.method !== "string" || raw.method.length === 0) return undefined;
  const mode = raw.mode === "direct" || raw.mode === "proxy" ? raw.mode : "direct";
  return {
    source: raw.source,
    group: raw.group,
    method: raw.method,
    variables: raw.variables,
    headers: sanitizeHeaders(raw.headers),
    mode,
  };
}

export function sanitizePlaygroundStreamPayload(raw: unknown): PlaygroundStreamPayload | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (typeof raw.source !== "string" || raw.source.length === 0) return undefined;
  if (typeof raw.group !== "string") return undefined;
  if (typeof raw.method !== "string" || raw.method.length === 0) return undefined;
  if (raw.transport !== "sse" && raw.transport !== "ws") return undefined;
  const result: PlaygroundStreamPayload = {
    source: raw.source,
    group: raw.group,
    method: raw.method,
    variables: raw.variables,
    transport: raw.transport,
    headers: sanitizeHeaders(raw.headers),
  };
  if (raw.mode === "direct" || raw.mode === "proxy") result.mode = raw.mode;
  return result;
}

export function sanitizePlaygroundWSSendPayload(raw: unknown): PlaygroundWSSendPayload | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (typeof raw.requestId !== "string" || raw.requestId.length === 0) return undefined;
  if (typeof raw.topic !== "string") return undefined;
  return { requestId: raw.requestId, topic: raw.topic, data: raw.data };
}
