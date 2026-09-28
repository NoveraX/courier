/**
 * Match a request path against an endpoint's path template.
 *
 * @param template Group-relative template, such as `":room/events"`
 * @param path     Group-relative request path, such as `"lobby/events"`
 * @returns The parameters the template captured, decoded, or `undefined`
 *   when the path does not match
 * @example
 * ```ts
 * matchPath(":room/events", "lobby/events"); // { room: "lobby" }
 * matchPath("ws-room", "room");              // undefined
 * ```
 */
export function matchPath(template: string, path: string): Record<string, string> | undefined {
  const expected = template.split("/").filter(Boolean);
  const actual = path.split("/").filter(Boolean);
  if (expected.length !== actual.length) return undefined;

  const params: Record<string, string> = {};
  for (const [index, segment] of expected.entries()) {
    const value = actual[index] ?? "";
    if (!segment.startsWith(":")) {
      if (segment !== value) return undefined;
      continue;
    }
    const decoded = decodeSegment(value);
    if (decoded === undefined) return undefined;
    params[segment.slice(1)] = decoded;
  }
  return params;
}

/* A malformed escape (`%E0%A4%A`) names no path the server declares. */
function decodeSegment(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
