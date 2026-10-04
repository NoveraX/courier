import type { RequestEntry } from "@/store/types";
import type { RequestState } from "./request-state";
import { isStreamRequest } from "./request-state";

/** A request's dotted name in two parts: its source, dimmed, and the endpoint. */
export interface EndpointParts {
  /** `api.` — the source and its dot. */
  prefix: string;
  /** `orders.create` — the group, when there is one, and the endpoint. */
  name: string;
}

/**
 * A request's dotted name, split for showing the source dimmed.
 *
 * @param r - The request
 * @returns The two parts
 * @example
 * ```ts
 * endpointParts({ source: "api", group: "orders", method: "create" }); // { prefix: "api.", name: "orders.create" }
 * ```
 */
export function endpointParts(r: Pick<RequestEntry, "source" | "group" | "method">): EndpointParts {
  return {
    prefix: r.source ? `${r.source}.` : "",
    name: r.group ? `${r.group}.${r.method}` : r.method,
  };
}

/**
 * The full dotted name of a request.
 *
 * @param r - The request
 * @returns `api.orders.create`
 * @example
 * ```ts
 * endpointName({ source: "api", group: undefined, method: "health" }); // "api.health"
 * ```
 */
export function endpointName(r: Pick<RequestEntry, "source" | "group" | "method">): string {
  const { prefix, name } = endpointParts(r);
  return `${prefix}${name}`;
}

/* What a relative URL is read against; its origin is never shown. */
const RELATIVE_BASE = "http://localhost";

/** A request's URL, split for showing: where it went, its path, its query. */
export interface UrlParts {
  origin: string;
  path: string;
  query: { key: string; value: string }[];
}

/**
 * A request's URL in its parts, or `null` when it has none Studio can read.
 *
 * @param url - The request's URL
 * @returns The parts
 * @example
 * ```ts
 * urlParts("http://localhost:5173/api/users?page=2"); // { origin: "http://localhost:5173", path: "/api/users", query: [{ key: "page", value: "2" }] }
 * ```
 */
export function urlParts(url: string | undefined): UrlParts | null {
  if (!url || !URL.canParse(url, RELATIVE_BASE)) return null;
  const parsed = new URL(url, RELATIVE_BASE);
  const origin = /^[a-z][a-z\d+.-]*:\/\//i.test(url) ? parsed.origin : "";
  const query = [...parsed.searchParams].map(([key, value]) => ({ key, value }));
  return { origin, path: parsed.pathname, query };
}

/**
 * The path and query a row shows beside the name.
 *
 * @param url - The request's URL
 * @returns `/api/users?page=2`, or an empty string
 * @example
 * ```ts
 * pathOf("http://localhost:5173/api/users?page=2"); // "/api/users?page=2"
 * ```
 */
export function pathOf(url: string | undefined): string {
  const parts = urlParts(url);
  if (!parts) return "";
  const search = parts.query.map(({ key, value }) => `${key}=${value}`).join("&");
  return search ? `${parts.path}?${search}` : parts.path;
}

/**
 * The HTTP method a request used: a stream opens with GET.
 *
 * @param r - The request
 * @returns The method, upper case
 * @example
 * ```ts
 * httpMethodOf({ httpMethod: "post" }); // "POST"
 * ```
 */
export function httpMethodOf(r: Pick<RequestEntry, "httpMethod">): string {
  return (r.httpMethod ?? "GET").toUpperCase();
}

/**
 * What the status column says: the HTTP code, `!` after one whose response
 * broke its schema, `SSE` or `WS` for a stream, `···` while in flight.
 *
 * @param r - The request
 * @param state - Its state
 * @returns The label
 * @example
 * ```ts
 * codeLabel({ statusCode: 200, transport: "http" }, "validation_error"); // "200!"
 * ```
 */
export function codeLabel(
  r: Pick<RequestEntry, "statusCode" | "transport">,
  state: RequestState,
): string {
  if (isStreamRequest(r)) return r.transport === "ws" ? "WS" : "SSE";
  if (state === "pending") return "···";
  if (state === "aborted") return "ABRT";
  const code = r.statusCode ? String(r.statusCode) : "—";
  return state === "validation_error" ? `${code}!` : code;
}
