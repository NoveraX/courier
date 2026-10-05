import type { PlaygroundEndpoint } from "./endpoint-choices";
import { queryString } from "./query-string";

/** A piece of the URL the Playground shows: its origin, a path segment, a parameter filled or missing, the query. */
export interface UrlPart {
  text: string;
  kind: "origin" | "path" | "param" | "missing" | "query";
}

/* The methods whose variables go in the query rather than the body. */
const QUERY_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "DELETE"]);

function fieldsOf(variables: unknown): Record<string, unknown> {
  return typeof variables === "object" && variables !== null && !Array.isArray(variables)
    ? Object.fromEntries(Object.entries(variables))
    : {};
}

/**
 * The URL a call goes to, in pieces: the source's origin, each path
 * segment with its parameters filled from the variables — or left as
 * `:name` while missing — and, for a method that sends no body, the
 * remaining variables as the query. A WebSocket's origin reads `ws://`.
 *
 * @param endpoint - The endpoint
 * @param variables - The variables the call sends
 * @returns The pieces, in order
 * @example
 * ```ts
 * requestUrlParts(byId, { id: 42 }).map((p) => p.text); // ["https://api.example.com", "/users", "/42"]
 * ```
 */
export function requestUrlParts(endpoint: PlaygroundEndpoint, variables: unknown): UrlPart[] {
  const base = endpoint.entry.baseURL.replace(/\/+$/, "");
  const origin = endpoint.transport === "ws" ? base.replace(/^http/i, "ws") : base;
  const fields = fieldsOf(variables);
  const used = new Set<string>();
  const parts: UrlPart[] = [{ text: origin, kind: "origin" }];
  for (const segment of endpoint.path.split("/").filter(Boolean)) {
    if (!segment.startsWith(":")) {
      parts.push({ text: `/${segment}`, kind: "path" });
      continue;
    }
    const name = segment.slice(1);
    const value = fields[name];
    used.add(name);
    const filled = value !== undefined && value !== null && value !== "";
    parts.push(
      filled
        ? { text: `/${encodeURIComponent(String(value))}`, kind: "param" }
        : { text: `/${segment}`, kind: "missing" },
    );
  }
  if (endpoint.transport === "http" && QUERY_METHODS.has(endpoint.httpMethod)) {
    const query = queryString(
      Object.fromEntries(Object.entries(fields).filter(([k]) => !used.has(k))),
    );
    if (query) parts.push({ text: query, kind: "query" });
  }
  return parts;
}
