/**
 * Whitelist sanitizers for `mock:command`, `mock:managed`, and
 * `mock:server:*` events crossing the studio Socket.IO boundary.
 *
 * Each sanitizer enforces:
 *
 *  1. **Discriminator presence** — `action` (UI commands) or `type`
 *     (server lifecycle events) must be a string. Anything else collapses
 *     to `undefined` and the caller skips the forward.
 *  2. **Identity strings** — `serverId` (and `command` for managed events)
 *     must be non-empty strings so downstream cache lookups can never key
 *     off `undefined`/`Symbol`/object coercions.
 *  3. **Payload pass-through** — per-action sub-payloads (`record`, `data`,
 *     `config`) are forwarded as `Record<string, unknown>` after a shallow
 *     plain-object check. Deep validation lives in the consuming code
 *     (mock manager + UI reducers) where the schema is known.
 *
 * If you add a new wire field to a `MockCommand` / mock lifecycle event,
 * add a guard here AND a test in `sanitize-mock-events.test.ts`. Same
 * whitelist class as `sanitize-source-map.ts`.
 */

export interface SanitizedMockCommand extends Record<string, unknown> {
  action: string;
  serverId: string;
}

export interface SanitizedMockManaged extends Record<string, unknown> {
  command: string;
  serverId?: string;
}

export interface SanitizedMockServerEvent extends Record<string, unknown> {
  type: string;
  serverId: string;
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  // Reject objects with a tampered prototype chain so a hostile sender
  // cannot smuggle `__proto__` / `constructor` mutations through the
  // `Object.assign`-style spreads downstream.
  const proto = Object.getPrototypeOf(raw);
  return proto === Object.prototype || proto === null;
}

/**
 * Validate a `mock:command` payload (UI → app sockets + managed processes).
 * Requires `action: string` and `serverId: string`; preserves arbitrary
 * extra fields so per-action sub-shapes (`record`, `config`, `id`, `count`,
 * etc.) flow through unchanged. Strips `__proto__`/`constructor` keys.
 */
export function sanitizeMockCommand(raw: unknown): SanitizedMockCommand | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (typeof raw.action !== "string" || raw.action.length === 0) return undefined;
  if (typeof raw.serverId !== "string" || raw.serverId.length === 0) return undefined;
  const result: SanitizedMockCommand = { action: raw.action, serverId: raw.serverId };
  for (const [key, value] of Object.entries(raw)) {
    if (key === "action" || key === "serverId") continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    result[key] = value;
  }
  return result;
}

/**
 * Validate a `mock:managed` payload (UI → studio mock manager). Requires
 * `command: string`; `serverId` is optional because lifecycle commands
 * like `mock:managed:startAll` operate on every server.
 */
export function sanitizeMockManaged(raw: unknown): SanitizedMockManaged | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (typeof raw.command !== "string" || raw.command.length === 0) return undefined;
  const result: SanitizedMockManaged = { command: raw.command };
  if (typeof raw.serverId === "string" && raw.serverId.length > 0) {
    result.serverId = raw.serverId;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key === "command" || key === "serverId") continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    result[key] = value;
  }
  return result;
}

/**
 * Validate a `mock:server:connect` / `mock:server:disconnect` /
 * `mock:network:config` event payload (app → studio server). All three
 * share the `{ type, serverId }` shape; per-type fields (`port`, `url`,
 * `name`, `config`, etc.) are preserved as-is.
 */
export function sanitizeMockServerEvent(raw: unknown): SanitizedMockServerEvent | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (typeof raw.type !== "string" || raw.type.length === 0) return undefined;
  if (typeof raw.serverId !== "string" || raw.serverId.length === 0) return undefined;
  const result: SanitizedMockServerEvent = { type: raw.type, serverId: raw.serverId };
  for (const [key, value] of Object.entries(raw)) {
    if (key === "type" || key === "serverId") continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    result[key] = value;
  }
  return result;
}

/**
 * Whitelist a `mock:network:config.config` sub-payload. Returns
 * `undefined` when the value is not a plain object so the caller can skip
 * the cache mutation. Sub-fields are preserved unchanged — the network
 * controls UI is the schema authority for the config blob.
 */
export function sanitizeMockNetworkConfig(raw: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(raw)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    result[key] = value;
  }
  return result;
}
