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
 *
 * @param source - The source's name
 * @param group - The group's name; `""` for an endpoint of no group
 * @param method - The endpoint's name
 * @param sourceMap - The declared API merged with what traffic showed
 * @param requests - The captured requests
 * @returns The path, or `""` for an endpoint that has none
 *
 * @example
 * ```ts
 * resolveFullPath("api", "users", "get", sourceMap, requests); // "/users/:id"
 * ```
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
