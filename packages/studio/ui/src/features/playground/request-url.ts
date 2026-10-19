import {
  pathPieces,
  sendsVariablesInQuery,
  withoutTrailingSlashes,
} from "@noverax/courier/internal";

import type { PlaygroundEndpoint } from "./endpoint-choices";
import { queryString } from "./query-string";

/** A piece of the URL the Playground shows: its origin, a path segment, a parameter filled or missing, the query. */
export interface UrlPart {
  text: string;
  kind: "origin" | "path" | "param" | "missing" | "query";
}

/* A parameter's piece of the URL: its value, encoded, or `:name` while it has none. */
function paramPart(lead: string, name: string, value: unknown): UrlPart {
  const filled = value !== undefined && value !== null && value !== "";
  return filled
    ? { text: `${lead}${encodeURIComponent(String(value))}`, kind: "param" }
    : { text: `${lead}:${name}`, kind: "missing" };
}

function fieldsOf(variables: unknown): Record<string, unknown> {
  return typeof variables === "object" && variables !== null && !Array.isArray(variables)
    ? Object.fromEntries(Object.entries(variables))
    : {};
}

/**
 * The URL a call goes to, in pieces: the source's origin, each path
 * segment with its parameters filled from the variables — or left as
 * `:name` while missing — and its text as it is sent, `::` as one colon,
 * and, for a method that sends no body, the remaining variables as the
 * query. A WebSocket's origin reads `ws://`.
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
  const base = withoutTrailingSlashes(endpoint.entry.baseURL);
  const origin = endpoint.transport === "ws" ? base.replace(/^http/i, "ws") : base;
  const fields = fieldsOf(variables);
  const used = new Set<string>();
  const parts: UrlPart[] = [{ text: origin, kind: "origin" }];
  for (const segment of endpoint.path.split("/").filter(Boolean)) {
    for (const [at, piece] of pathPieces(segment).entries()) {
      const lead = at === 0 ? "/" : "";
      if (piece.kind === "text") {
        parts.push({ text: `${lead}${piece.text}`, kind: "path" });
        continue;
      }
      used.add(piece.name);
      parts.push(paramPart(lead, piece.name, fields[piece.name]));
    }
  }
  if (endpoint.transport === "http" && sendsVariablesInQuery(endpoint.httpMethod)) {
    const query = queryString(
      Object.fromEntries(Object.entries(fields).filter(([k]) => !used.has(k))),
    );
    if (query) parts.push({ text: query, kind: "query" });
  }
  return parts;
}
