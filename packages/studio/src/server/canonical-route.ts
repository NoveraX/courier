/* A percent-escape of an ASCII character: what a route's own name can be spelled with. */
const ESCAPED_ASCII = /%([0-7][0-9a-f])/gi;
const AN_ESCAPED_ASCII = /%[0-7][0-9a-f]/i;

/**
 * How many times over a path's escapes are decoded. Each hop that reads a
 * path may decode it once — a proxy in front of Studio, a second proxy,
 * Express itself — so three passes read every spelling such a chain makes
 * of a route, and a path escaped more times over names no route a client
 * asks for in earnest. Decoding until nothing was left took a pass for each
 * level, each as long as the path: a path escaped thousands of times over
 * held every request up for most of a second.
 */
export const DECODING_PASSES = 3;

/**
 * The longest path read as a route. Studio's routes and its pages'
 * addresses are a few dozen characters — what a page shows rides in the
 * query, no part of the path — so a path past 2 KB, a length every browser
 * and proxy carries, names nothing Studio serves.
 */
export const LONGEST_ROUTE_PATH = 2048;

/**
 * The route a request path names, spelled one way: escapes of ASCII
 * characters decoded, a backslash read as a slash, empty and `.` segments
 * dropped, `..` applied, no trailing slash, lower case.
 *
 * A router that reads a path more loosely than Studio's own — any case, a
 * trailing slash, a doubled slash, an escaped letter, a proxy in front that
 * decodes or normalizes — reaches no route under another name than this.
 * A path that cannot be read so within bounds — longer than
 * {@link LONGEST_ROUTE_PATH}, or with escapes left after
 * {@link DECODING_PASSES} — names no route Studio can tell: `undefined`.
 *
 * @param path - The request's path, without its query
 * @returns The route it names, or `undefined` for a path past the bounds
 * @example
 * ```ts
 * canonicalRoute("/API//sessions/%73ave/"); // → "/api/sessions/save"
 * canonicalRoute("/api/x/../storage/./compact"); // → "/api/storage/compact"
 * canonicalRoute("/api/%25252573ave"); // → undefined: escaped four times over
 * ```
 */
export function canonicalRoute(path: string): string | undefined {
  if (path.length > LONGEST_ROUTE_PATH) return undefined;
  const decoded = unescaped(path);
  if (decoded === undefined) return undefined;
  const segments: string[] = [];
  for (const segment of decoded.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`.toLowerCase();
}

/* Escapes of escapes too (`%2561` → `%61` → `a`), whatever a hop in front decoded. */
function unescaped(path: string): string | undefined {
  let current = path;
  for (let pass = 0; pass < DECODING_PASSES; pass++) {
    const next = current.replace(ESCAPED_ASCII, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    if (next === current) return current;
    current = next;
  }
  return AN_ESCAPED_ASCII.test(current) ? undefined : current;
}
