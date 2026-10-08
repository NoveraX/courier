import { isPlainObject } from "../is-plain-object";
import { isSecretName } from "../mcp/without-secrets";
import type { SavedRequest } from "../session-types";
import { REDACTED } from "../storage/without-credentials";

/* Deep enough for any body a request carries; what lies deeper is cut, not walked. */
const DEEPEST = 64;

/**
 * A request as a session file carries it: every body field named like a
 * secret — in its variables and in its answer — and every such parameter of
 * its address's query replaced, each replaced value's place added to
 * `found`: `requests[2].variables.password`, `requests[2].url?token`.
 *
 * @param request - The request, credential headers already left out
 * @param at - Its place in the session
 * @param found - Where the replaced values are listed
 * @returns The request with its secrets replaced
 * @example
 * ```ts
 * const found: string[] = [];
 * session.requests.map((request, at) => scrubbedRequest(request, at, found));
 * ```
 */
export function scrubbedRequest(request: SavedRequest, at: number, found: string[]): SavedRequest {
  const place = `requests[${at}]`;
  return {
    ...request,
    variables: scrubbed(request.variables, `${place}.variables`, found, 0),
    data: scrubbed(request.data, `${place}.data`, found, 0),
    ...(request.url !== undefined && { url: scrubbedUrl(request.url, `${place}.url`, found) }),
  };
}

function scrubbed(value: unknown, path: string, found: string[], depth: number): unknown {
  if (depth > DEEPEST) return "[cut]";
  if (Array.isArray(value)) {
    return value.map((item, at) => scrubbed(item, `${path}[${at}]`, found, depth + 1));
  }
  if (!isPlainObject(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (isSecretName(key) && inner !== undefined && inner !== null) {
      found.push(`${path}.${key}`);
      copy[key] = REDACTED;
    } else copy[key] = scrubbed(inner, `${path}.${key}`, found, depth + 1);
  }
  return copy;
}

/* A read sends its variables in the query, so a `?token=` there is a secret like a body's. */
function scrubbedUrl(url: string, path: string, found: string[]): string {
  const query = url.indexOf("?");
  if (query === -1) return url;
  const hash = url.indexOf("#", query);
  const end = hash === -1 ? url.length : hash;
  const pairs = url.slice(query + 1, end).split("&");
  const kept = pairs.map((pair) => {
    const equals = pair.indexOf("=");
    const name = equals === -1 ? pair : pair.slice(0, equals);
    if (equals === -1 || !isSecretName(decoded(name))) return pair;
    found.push(`${path}?${decoded(name)}`);
    return `${name}=${REDACTED}`;
  });
  return `${url.slice(0, query + 1)}${kept.join("&")}${url.slice(end)}`;
}

function decoded(name: string): string {
  try {
    return decodeURIComponent(name.replace(/\+/g, " "));
  } catch {
    /* A name that is not valid percent-encoding is read as it is written. */
    return name;
  }
}
