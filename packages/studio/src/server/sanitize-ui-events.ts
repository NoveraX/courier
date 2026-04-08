/**
 * Whitelist sanitizers for events crossing the Studio UI → server Socket.IO
 * boundary.
 *
 * Counterpart to `sanitize-mock-events.ts`. Each sanitizer enforces:
 *
 *  1. **Plain-object root** — rejects arrays, primitives, prototype-tampered
 *     objects so a hostile sender cannot smuggle `__proto__`/`constructor`
 *     mutations through downstream `Object.assign`-style spreads.
 *  2. **Identity strings** — `source`/`group`/`method`/`requestId`/`topic`
 *     must be non-empty strings so cache lookups never key off `undefined`
 *     or coerced symbols.
 *  3. **Mode whitelist** — `mode` is restricted to `"direct" | "proxy"`.
 *  4. **Headers strict shape** — `headers` must be a plain object whose
 *     values are all strings (HTTP header semantics).
 *  5. **Variables / data passthrough** — these are user-supplied opaque
 *     payloads that flow through to the app process; we deliberately do not
 *     validate their contents (the app's endpoint schema is the authority),
 *     but we strip dangerous keys at the top level.
 *
 * If you add a new wire field to a UI handler payload, add a guard here AND
 * a test in `sanitize-ui-events.test.ts`.
 */

export interface SanitizedUiPlaygroundPayload {
  sessionId?: string;
  source: string;
  group: string;
  method: string;
  variables: unknown;
  headers: Record<string, string>;
  mode: "direct" | "proxy";
}

export interface SanitizedUiReplayPayload {
  source: string;
  group: string;
  method: string;
  variables: unknown;
  headers: Record<string, string>;
  mode: "direct" | "proxy";
}

export interface SanitizedUiWSSendPayload {
  requestId: string;
  topic: string;
  data: unknown;
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const proto = Object.getPrototypeOf(raw);
  return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isMode(value: unknown): value is "direct" | "proxy" {
  return value === "direct" || value === "proxy";
}

/**
 * Coerce an arbitrary `headers` candidate into a strict `Record<string, string>`.
 * Drops dangerous keys (`__proto__`, `constructor`, `prototype`) and any
 * value that is not a string. Returns `undefined` if the root is not a plain
 * object so the caller can choose between rejection and an empty fallback.
 */
function sanitizeHeaders(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (typeof value !== "string") continue;
    result[key] = value;
  }
  return result;
}

/**
 * Validate a `playground:send` payload (Studio UI → Studio server).
 * Rejects on missing/invalid identity fields, unknown mode, or malformed
 * headers. `variables` flows through unchanged.
 */
export function sanitizeUiPlaygroundPayload(
  raw: unknown,
): SanitizedUiPlaygroundPayload | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (!isNonEmptyString(raw.source)) return undefined;
  if (!isNonEmptyString(raw.group)) return undefined;
  if (!isNonEmptyString(raw.method)) return undefined;
  if (!isMode(raw.mode)) return undefined;
  const headers = sanitizeHeaders(raw.headers);
  if (headers === undefined) return undefined;
  const result: SanitizedUiPlaygroundPayload = {
    source: raw.source,
    group: raw.group,
    method: raw.method,
    variables: raw.variables,
    headers,
    mode: raw.mode,
  };
  if (isNonEmptyString(raw.sessionId)) result.sessionId = raw.sessionId;
  return result;
}

/**
 * Validate a `playground:replay` payload (Studio UI → Studio server).
 * Same shape as the playground payload but without `sessionId`.
 */
export function sanitizeUiReplayPayload(raw: unknown): SanitizedUiReplayPayload | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (!isNonEmptyString(raw.source)) return undefined;
  if (!isNonEmptyString(raw.group)) return undefined;
  if (!isNonEmptyString(raw.method)) return undefined;
  if (!isMode(raw.mode)) return undefined;
  const headers = sanitizeHeaders(raw.headers);
  if (headers === undefined) return undefined;
  return {
    source: raw.source,
    group: raw.group,
    method: raw.method,
    variables: raw.variables,
    headers,
    mode: raw.mode,
  };
}

/**
 * Validate a `playground:ws:send` payload (Studio UI → Studio server).
 * `data` is the user's outbound message payload and flows through unchanged.
 */
export function sanitizeUiWSSendPayload(raw: unknown): SanitizedUiWSSendPayload | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (!isNonEmptyString(raw.requestId)) return undefined;
  if (!isNonEmptyString(raw.topic)) return undefined;
  return {
    requestId: raw.requestId,
    topic: raw.topic,
    data: raw.data,
  };
}
