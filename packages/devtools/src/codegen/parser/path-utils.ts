/**
 * Path manipulation utilities for OpenAPI/Postman parsers.
 */

/** Convert OpenAPI path params `{id}` to Nexus-style `:id` */
export function convertPathParams(path: string): string {
  return path.replace(/\{([\w-]+)\}/g, (_, name) => `:${name.replace(/-/g, "_")}`);
}

/** Extract path from Postman URL (strip protocol, host, query) */
export function extractPostmanPath(url: string): string {
  try {
    const u = new URL(url.replace(/\{\{.*?\}\}/g, "localhost"));
    return u.pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

/** Find common path prefix from a set of paths */
export function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "/";
  if (paths.length === 1) {
    const first = paths[0] ?? "";
    const parts = first.split("/").filter(Boolean);
    if (parts.length <= 1) return "/";
    return `/${parts.slice(0, -1).join("/")}`;
  }

  const segments = paths.map((p) => p.split("/").filter(Boolean));
  const minLen = Math.min(...segments.map((s) => s.length));
  const common: string[] = [];
  const firstSegments = segments[0] ?? [];

  for (let i = 0; i < minLen; i++) {
    const segment = firstSegments[i];
    if (!segment || segment.startsWith("{") || segment.startsWith(":")) break;
    if (segments.every((s) => s[i] === segment)) {
      common.push(segment);
    } else break;
  }

  return common.length > 0 ? `/${common.join("/")}` : "/";
}
