/**
 * How an endpoint's path is read when a call is addressed.
 *
 * `:name` is a parameter, filled from the variables: a letter or `_`, then
 * letters, digits and `_`. `::` is one colon the path sends as written, for
 * an API whose paths put a colon before a word, as Google's methods do —
 * `index::inspect` is sent as `index:inspect`. Any other colon, one before
 * a digit, a dash or the end, is sent as written. The scheme and host of an
 * absolute URL are never read, so a port or an IPv6 address holds no
 * parameter.
 */

/** A piece of a path: text it sends as written, or a parameter filled from the variables. */
export type PathPiece =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "param"; readonly name: string };

const PIECE = /::|:([a-zA-Z_][a-zA-Z0-9_]*)/g;
const ORIGIN = /^[a-z][a-z\d+.-]*:\/\/[^/]*/i;

/* The scheme and host of an absolute URL, read as text; `""` for a path. */
function originOf(path: string): string {
  return ORIGIN.exec(path)?.[0] ?? "";
}

/**
 * The names of a path's parameters, in the order the path holds them.
 *
 * @param path - The path, as an endpoint declares it
 * @returns The names; one the path holds twice is named twice
 * @example
 * ```ts
 * pathParamNames("orgs/:orgId/users/:id.json"); // → ["orgId", "id"]
 * pathParamNames("v1/:name::cancel"); // → ["name"]
 * ```
 */
export function pathParamNames(path: string): string[] {
  const names: string[] = [];
  for (const match of path.slice(originOf(path).length).matchAll(PIECE)) {
    if (match[1] !== undefined) names.push(match[1]);
  }
  return names;
}

/**
 * The path a call goes to: each parameter replaced with what `fill` gives
 * for it, and each `::` sent as one colon.
 *
 * @param path - The path, as an endpoint declares it
 * @param fill - The text that takes a parameter's place, encoded as the path sends it
 * @returns The path as it is sent
 * @example
 * ```ts
 * fillPathParams("v1/:name::cancel", () => "op-1"); // → "v1/op-1:cancel"
 * fillPathParams("v1/urlInspection/index::inspect", () => ""); // → "v1/urlInspection/index:inspect"
 * ```
 */
export function fillPathParams(path: string, fill: (name: string) => string): string {
  const origin = originOf(path);
  return (
    origin +
    path
      .slice(origin.length)
      .replace(PIECE, (_piece, name: string | undefined) => (name === undefined ? ":" : fill(name)))
  );
}

/**
 * A path in pieces — the text it sends, with `::` read as one colon, and
 * its parameters — for a reader that writes the path in another form: an
 * OpenAPI path, a mock server's route, a URL with its parameters marked.
 *
 * @param path - The path, as an endpoint declares it
 * @returns The pieces in order; text next to text is one piece
 * @example
 * ```ts
 * pathPieces("v1/:name::cancel");
 * // → [{ kind: "text", text: "v1/" }, { kind: "param", name: "name" }, { kind: "text", text: ":cancel" }]
 * ```
 */
export function pathPieces(path: string): PathPiece[] {
  const origin = originOf(path);
  const local = path.slice(origin.length);
  const pieces: PathPiece[] = [];
  let text = origin;
  let from = 0;
  for (const match of local.matchAll(PIECE)) {
    text += local.slice(from, match.index);
    from = match.index + match[0].length;
    const name = match[1];
    if (name === undefined) {
      text += ":";
      continue;
    }
    if (text !== "") pieces.push({ kind: "text", text });
    pieces.push({ kind: "param", name });
    text = "";
  }
  text += local.slice(from);
  if (text !== "") pieces.push({ kind: "text", text });
  return pieces;
}

/**
 * Text written into a path so that the path sends it as written: each
 * colon doubled, so that none starts a parameter.
 *
 * @param text - The text, as the request sends it
 * @returns The text as a path writes it
 * @example
 * ```ts
 * escapePathText("index:inspect"); // → "index::inspect"
 * ```
 */
export function escapePathText(text: string): string {
  return text.replaceAll(":", "::");
}
