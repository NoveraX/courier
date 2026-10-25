import {
  pathPieces,
  sendsVariablesInQuery,
  withoutTrailingSlashes,
} from "@noverax/courier/internal";

import type { PlaygroundEndpoint } from "./endpoint-choices";
import { queryString, withQuery } from "./query-string";

/** A piece of the URL the Playground shows: its origin, a path segment, a parameter filled or missing, the query. */
export interface UrlPart {
  text: string;
  kind: "origin" | "path" | "param" | "missing" | "query";
}

/* Where a path's query or fragment starts: text, a `:name` in it too. */
const QUERY_OR_FRAGMENT = /[?#]/;

/* Each segment of a path, its parameters filled from the variables and noted as used. */
function segmentParts(path: string, fields: Record<string, unknown>, used: Set<string>): UrlPart[] {
  const parts: UrlPart[] = [];
  for (const segment of path.split("/").filter(Boolean)) {
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
  return parts;
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
 * `:name` while missing — and its text as it is sent, `::` as one colon;
 * then a query the path writes, as written; and, for a method that sends no
 * body, the remaining variables as the query, after `&` when the path wrote
 * one. A WebSocket's origin reads `ws://`.
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
  const at = endpoint.path.search(QUERY_OR_FRAGMENT);
  const local = at < 0 ? endpoint.path : endpoint.path.slice(0, at);
  const written = at < 0 ? "" : endpoint.path.slice(at);
  const parts: UrlPart[] = [{ text: origin, kind: "origin" }, ...segmentParts(local, fields, used)];
  if (written) parts.push({ text: written, kind: "path" });
  if (endpoint.transport === "http" && sendsVariablesInQuery(endpoint.httpMethod)) {
    const query = queryString(
      Object.fromEntries(Object.entries(fields).filter(([k]) => !used.has(k))),
    );
    /* After `&` when the path wrote a query of its own. */
    if (query) parts.push({ text: withQuery(written, query).slice(written.length), kind: "query" });
  }
  return parts;
}
