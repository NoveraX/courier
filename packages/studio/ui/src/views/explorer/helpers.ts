import type { RequestEntry, SourceMap } from "@/store/types";

// ── Path resolution ─────────────────────────────────────────────────────────

/**
 * Resolves the full URL path for an endpoint (e.g. `/users/:id`).
 *
 * A declared endpoint's path is its group prefix and its own path. A stream
 * or channel declared with no path is served by the app itself and has no
 * URL path of its own. For an endpoint known from traffic alone, the path
 * is read from a request's URL, generalizing numeric/UUID segments into
 * `:param` placeholders, and falls back to the group prefix.
 */
export function resolveFullPath(
  source: string,
  group: string,
  method: string,
  sourceMap: SourceMap,
  requests: RequestEntry[],
): string {
  const src = sourceMap[source];
  const baseURL = src?.baseURL ?? "";
  const grp = src?.groups[group];
  const prefix = grp?.prefix || (group ? `/${group}` : "");
  const endpoint = grp?.endpoints[method];

  // 1. The declared path (e.g. prefix "users" and ":id" → "/users/:id")
  if (endpoint && endpoint.origin !== "runtime" && endpoint.path !== undefined) {
    if (endpoint.path === "" && endpoint.transport) return "";
    return joinPath(prefix, endpoint.path);
  }

  // 2. Try to extract path from the first request with a URL
  const req = requests.find(
    (r) =>
      r.source === source &&
      (r.group ?? "") === group &&
      r.method === method &&
      r.url,
  );

  if (req?.url) {
    return extractPathFromUrl(req.url, baseURL);
  }

  // 3. Fallback to group prefix or /methodName for flat endpoints
  return prefix || `/${method}`;
}

/** Join path parts into one path with a single leading slash, e.g. `/users/:id`. */
function joinPath(...parts: string[]): string {
  const segments = parts.flatMap((part) => part.split("/")).filter((segment) => segment !== "");
  return `/${segments.join("/")}`;
}

/** Strips baseURL, generalizes dynamic segments into `:param` */
function extractPathFromUrl(url: string, baseURL: string): string {
  let path = url;

  // Remove baseURL prefix if present
  if (baseURL && path.startsWith(baseURL)) {
    path = path.slice(baseURL.length);
  }

  // Remove protocol + host if still a full URL
  try {
    const parsed = new URL(path);
    path = parsed.pathname + parsed.search;
  } catch {
    // Already a relative path
  }

  // Remove query string
  const queryIdx = path.indexOf("?");
  if (queryIdx !== -1) path = path.slice(0, queryIdx);

  // Generalize dynamic segments (numbers, UUIDs) into :param
  return generalizePath(path);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Replaces numeric/UUID path segments with `:id` / `:param` */
function generalizePath(path: string): string {
  return path
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return ":id";
      if (UUID_RE.test(seg)) return ":id";
      return seg;
    })
    .join("/");
}

// ── HTTP method inference ───────────────────────────────────────────────────

const HTTP_HEURISTICS: [RegExp, string][] = [
  [/^(get|find|list|fetch|load|search|read|check)/i, "GET"],
  [/^(create|add|insert|register|submit|upload)/i, "POST"],
  [/^(update|edit|modify|replace|set)/i, "PUT"],
  [/^(patch|partial)/i, "PATCH"],
  [/^(delete|remove|destroy|drop|revoke)/i, "DELETE"],
];

/** Infers HTTP method from endpoint name and type */
export function inferHttpMethod(
  endpointType: "query" | "mutation" | "untyped",
  method: string,
): string {
  for (const [pattern, httpMethod] of HTTP_HEURISTICS) {
    if (pattern.test(method)) return httpMethod;
  }
  return endpointType === "mutation" ? "POST" : "GET";
}

// ── Endpoint key ────────────────────────────────────────────────────────────

export function formatEndpointKey(
  source: string,
  group: string,
  method: string,
): string {
  return `${source}.${group}.${method}`;
}

export function parseEndpointKey(
  key: string,
): { source: string; group: string; method: string } {
  const [source = "", group = "", method = ""] = key.split(".");
  return { source, group, method };
}

// ── Request filtering ───────────────────────────────────────────────────────

/**
 * Filters requests for a specific source/group/method combination.
 * Source matching is case-insensitive because server and client sessions
 * may register the same API under different-cased keys.
 *
 * An omitted `group` matches every group. A `""` group means the ungrouped
 * endpoints of a source, which the catalogue keys as `""` while their requests
 * carry no group at all — comparing the two directly matched nothing, so every
 * per-endpoint metric for a source without groups read zero.
 */
export function filterRequests(
  requests: RequestEntry[],
  source: string,
  group?: string,
  method?: string,
): RequestEntry[] {
  const srcLower = source.toLowerCase();
  return requests.filter((r) => {
    if (r.source.toLowerCase() !== srcLower) return false;
    if (group !== undefined && (r.group ?? "") !== group) return false;
    if (method !== undefined && r.method !== method) return false;
    return true;
  });
}
