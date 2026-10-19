import { segmentTemplate } from "./segment-template";

/**
 * Match a request path against an endpoint's path template.
 *
 * A segment of text matches itself, `::` standing for one colon in it; a
 * parameter takes a whole segment, or its part of one it shares with text,
 * as Google's `:name::cancel` does.
 *
 * @param template Group-relative template, such as `":room/events"`
 * @param path     Group-relative request path, such as `"lobby/events"`
 * @returns The parameters the template captured, decoded, or `undefined`
 *   when the path does not match
 * @example
 * ```ts
 * matchPath(":room/events", "lobby/events"); // { room: "lobby" }
 * matchPath(":room::watch", "lobby:watch");  // { room: "lobby" }
 * matchPath("ws-room", "room");              // undefined
 * ```
 */
export function matchPath(template: string, path: string): Record<string, string> | undefined {
  const expected = template.split("/").filter(Boolean);
  const actual = path.split("/").filter(Boolean);
  if (expected.length !== actual.length) return undefined;

  const params: Record<string, string> = {};
  for (const [index, segment] of expected.entries()) {
    const { names, match } = segmentTemplate(segment);
    const values = match(actual[index] ?? "");
    if (values === undefined) return undefined;
    for (const [at, name] of names.entries()) {
      const decoded = decodeSegment(values[at] ?? "");
      if (decoded === undefined) return undefined;
      params[name] = decoded;
    }
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
