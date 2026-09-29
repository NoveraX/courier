/**
 * Whitelist sanitizers for events crossing the runtime → Studio Socket.IO
 * boundary on the `/runtime` namespace.
 *
 * Counterpart to `sanitize-ui-events.ts` (UI → server) and
 * `sanitize-mock-events.ts` (mock child → server). Each sanitizer enforces:
 *
 *  1. **Plain-object root** — rejects arrays, primitives, and prototype-tampered
 *     objects so a hostile sender cannot smuggle `__proto__` mutations into
 *     downstream registry maps.
 *  2. **Identity strings** — `runtimeId`, source names, and transport tokens
 *     must be non-empty strings.
 *  3. **Whitelist enums** — `kind` is restricted to `"browser" | "server"`;
 *     transports are restricted to `"http" | "sse" | "ws"`.
 *  4. **Array shape** — `transports` and `sources` must be arrays of the
 *     above-validated atoms; any non-conforming entry is dropped silently.
 *
 * If you add a new wire field to a `runtime:*` payload, add a guard here AND
 * a test in `sanitize-runtime-events.test.ts`.
 */

import { isSafeHttpOrigin } from "@noverax/courier-studio-core";
import type { BindingTransport } from "./catalog/binding-table";
import { isPlainObject } from "./is-plain-object";

const RUNTIME_ID_PATTERN = /^[a-zA-Z0-9_-]{1,256}$/;
const SOURCES_HASH_PATTERN = /^[a-f0-9]{16}$/;
const FRAMEWORK_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;

export interface SanitizedRuntimeHello {
  runtimeId: string;
  kind: "browser" | "server";
  /**
   * Canonical HTTP(S) origin the runtime listens on (e.g. `http://localhost:3000`).
   * Server-side runtimes know this from their `apiRoute`/`createCourierServer` config;
   * browser runtimes omit it. The Studio falls back to `socket.handshake.headers.host`
   * when absent.
   */
  listenOrigin?: string;
  /**
   * Stable fingerprint of the runtime's source set. SHA-256 hex truncated to 16
   * chars (matches the convention in `apis/merge/hash.ts`). Used by the binding
   * table to detect topology drift across runtime restarts; populated by adapter
   * announcements once `announceHosting` lands the canonical source list.
   */
  sourcesHash?: string;
}

export interface SanitizedRuntimeAnnounce {
  transports: BindingTransport[];
  sources: string[];
  /**
   * Canonical HTTP(S) origin where the runtime serves these transports.
   * Adapter-supplied (e.g. via `apiRoute({ listenOrigin })` or `createCourierServer`'s
   * `.listen()` callback). Studio uses it for the playground "resolved URL" badge
   * and for any future server-side proxy that needs to reach the runtime.
   */
  listenOrigin?: string;
  /**
   * Adapter brand string, e.g. `"next"`, `"hono"`, `"standalone"`. Used in
   * Studio's runtime banner; falls back to `runtimeId` when absent.
   */
  framework?: string;
}

const VALID_TRANSPORTS: ReadonlyArray<BindingTransport> = ["http", "sse", "ws"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRuntimeKind(value: unknown): value is "browser" | "server" {
  return value === "browser" || value === "server";
}

function isBindingTransport(value: unknown): value is BindingTransport {
  return typeof value === "string" && (VALID_TRANSPORTS as ReadonlyArray<string>).includes(value);
}

/**
 * Validate a `runtime:hello` payload (runtime → Studio).
 *
 * Returns `undefined` on any structural failure so the namespace handler can
 * reject the connection without throwing inside socket.io's event loop.
 */
export function sanitizeRuntimeHello(raw: unknown): SanitizedRuntimeHello | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (!isNonEmptyString(raw.runtimeId) || !RUNTIME_ID_PATTERN.test(raw.runtimeId)) {
    return undefined;
  }
  if (!isRuntimeKind(raw.kind)) return undefined;
  const result: SanitizedRuntimeHello = { runtimeId: raw.runtimeId, kind: raw.kind };
  if (typeof raw.listenOrigin === "string" && isSafeHttpOrigin(raw.listenOrigin)) {
    result.listenOrigin = raw.listenOrigin;
  }
  if (typeof raw.sourcesHash === "string" && SOURCES_HASH_PATTERN.test(raw.sourcesHash)) {
    result.sourcesHash = raw.sourcesHash;
  }
  return result;
}

/**
 * Validate a `runtime:announce` payload (runtime → Studio).
 *
 * Drops malformed transport/source entries silently. An entirely empty result
 * is still returned (the binding table treats it as a runtime that announced
 * "I host nothing right now"); callers that want to reject empty announces
 * must check `transports.length` themselves.
 */
export function sanitizeRuntimeAnnounce(raw: unknown): SanitizedRuntimeAnnounce | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (!Array.isArray(raw.transports) || !Array.isArray(raw.sources)) return undefined;
  const transports: BindingTransport[] = [];
  for (const t of raw.transports) {
    if (isBindingTransport(t) && !transports.includes(t)) transports.push(t);
  }
  const sources: string[] = [];
  for (const s of raw.sources) {
    if (isNonEmptyString(s) && !sources.includes(s)) sources.push(s);
  }
  const result: SanitizedRuntimeAnnounce = { transports, sources };
  if (typeof raw.listenOrigin === "string" && isSafeHttpOrigin(raw.listenOrigin)) {
    result.listenOrigin = raw.listenOrigin;
  }
  if (typeof raw.framework === "string" && FRAMEWORK_PATTERN.test(raw.framework)) {
    result.framework = raw.framework;
  }
  return result;
}
