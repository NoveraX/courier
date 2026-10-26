import { segmentTemplate } from "./segment-template";

/* One compiled pattern per template: a channel's path is matched on every connection. */
const PATTERNS = new Map<string, { readonly pattern: RegExp; readonly names: readonly string[] }>();

/**
 * Match a request path against an endpoint's path template.
 *
 * A segment of text matches itself, `::` standing for one colon in it; a
 * parameter takes a whole segment, or its part of one it shares with text,
 * as Google's `:name::cancel` does; and a `{+name}` takes the segments its
 * value's slashes divide.
 *
 * @param template Group-relative template, such as `":room/events"`
 * @param path     Group-relative request path, such as `"lobby/events"`
 * @returns The parameters the template captured, decoded, or `undefined`
 *   when the path does not match
 * @example
 * ```ts
 * matchPath(":room/events", "lobby/events"); // { room: "lobby" }
 * matchPath(":room::watch", "lobby:watch");  // { room: "lobby" }
 * matchPath("rooms/{+name}", "rooms/a/b");   // { name: "a/b" }
 * matchPath("ws-room", "room");              // undefined
 * ```
 */
export function matchPath(template: string, path: string): Record<string, string> | undefined {
  const { pattern, names } = compiled(template);
  const values = pattern.exec(path.split("/").filter(Boolean).join("/"))?.slice(1);
  if (values === undefined) return undefined;

  const params: Record<string, string> = {};
  for (const [at, name] of names.entries()) {
    const decoded = decodeSegment(values[at] ?? "");
    if (decoded === undefined) return undefined;
    params[name] = decoded;
  }
  return params;
}

function compiled(template: string): {
  readonly pattern: RegExp;
  readonly names: readonly string[];
} {
  const known = PATTERNS.get(template);
  if (known) return known;
  const segments = template.split("/").filter(Boolean).map(segmentTemplate);
  const made = {
    pattern: new RegExp(`^${segments.map((segment) => segment.capture).join("/")}$`),
    names: segments.flatMap((segment) => segment.names),
  };
  PATTERNS.set(template, made);
  return made;
}

/* A malformed escape (`%E0%A4%A`) names no path the server declares. */
function decodeSegment(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
