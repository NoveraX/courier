/**
 * How an endpoint's path is read when a call is addressed.
 *
 * `:name` is a parameter, filled from the variables: a letter or `_`, then
 * letters, digits and `_`. `{name}` is the same parameter with its end
 * written, for one text follows at once — `files/{id}abc` — and `{+name}`
 * is one whose value keeps its slashes, as Google's `v1/{+name}` takes
 * `projects/p/operations/o`. `::` is one colon the path sends as written,
 * for an API whose paths put a colon before a word, as Google's methods do —
 * `index::inspect` is sent as `index:inspect`. Any other colon or brace is
 * sent as written. The scheme and host of an absolute URL are never read,
 * so a port or an IPv6 address holds no parameter; nor does a query or a
 * fragment the path writes after `?` or `#`, which is text — a read's
 * variables go to its query string themselves.
 */

/** One of a path's parameters, as the path writes it. */
export interface PathParam {
  readonly kind: "param";
  readonly name: string;
  /** Written `{+name}`: its value is sent with its slashes, each part encoded. */
  readonly keepsSlashes: boolean;
  /** As the path writes it — `:id`, `{id}` or `{+name}` — for a reader that shows it unfilled. */
  readonly written: string;
}

/** A piece of a path: text it sends as written, or a parameter filled from the variables. */
export type PathPiece = { readonly kind: "text"; readonly text: string } | PathParam;

/** A path cut where its parameters are read: an absolute URL's scheme and host before, its query and fragment after. */
interface PathParts {
  readonly origin: string;
  readonly local: string;
  readonly rest: string;
}

const PIECE = /::|\{(\+?)([a-zA-Z_][a-zA-Z0-9_]*)\}|:([a-zA-Z_][a-zA-Z0-9_]*)/g;
const ORIGIN = /^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i;
const QUERY_OR_FRAGMENT = /[?#]/;

function partsOf(path: string): PathParts {
  const origin = ORIGIN.exec(path)?.[0] ?? "";
  const after = path.slice(origin.length);
  const end = after.search(QUERY_OR_FRAGMENT);
  if (end < 0) return { origin, local: after, rest: "" };
  return { origin, local: after.slice(0, end), rest: after.slice(end) };
}

/* The parameter a match of PIECE writes, or none for `::`. */
function paramOf(match: readonly (string | undefined)[]): PathParam | undefined {
  const [written, plus, braced, colon] = match;
  const name = braced ?? colon;
  if (written === undefined || name === undefined) return undefined;
  return { kind: "param", name, keepsSlashes: plus === "+", written };
}

/**
 * The names of a path's parameters, in the order the path holds them.
 *
 * @param path - The path, as an endpoint declares it
 * @returns The names; one the path holds twice is named twice
 * @example
 * ```ts
 * pathParamNames("orgs/:orgId/users/:id.json"); // → ["orgId", "id"]
 * pathParamNames("v1/{+name}::cancel"); // → ["name"]
 * pathParamNames("users?sort=:field"); // → []
 * ```
 */
export function pathParamNames(path: string): string[] {
  const names: string[] = [];
  for (const match of partsOf(path).local.matchAll(PIECE)) {
    const param = paramOf(match);
    if (param) names.push(param.name);
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
 * fillPathParams("items/:id?expand=:what", () => "7"); // → "items/7?expand=:what"
 * ```
 */
export function fillPathParams(
  path: string,
  fill: (name: string, param: PathParam) => string,
): string {
  const { origin, local, rest } = partsOf(path);
  const filled = local.replace(PIECE, (...match: (string | undefined)[]) => {
    const param = paramOf(match);
    return param ? fill(param.name, param) : ":";
  });
  return `${origin}${filled}${rest}`;
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
 * // → [{ kind: "text", text: "v1/" }, { kind: "param", name: "name", … }, { kind: "text", text: ":cancel" }]
 * ```
 */
export function pathPieces(path: string): PathPiece[] {
  const { origin, local, rest } = partsOf(path);
  const pieces: PathPiece[] = [];
  let text = origin;
  let from = 0;
  for (const match of local.matchAll(PIECE)) {
    text += local.slice(from, match.index);
    from = match.index + match[0].length;
    const param = paramOf(match);
    if (param === undefined) {
      text += ":";
      continue;
    }
    if (text !== "") pieces.push({ kind: "text", text });
    pieces.push(param);
    text = "";
  }
  text += local.slice(from) + rest;
  if (text !== "") pieces.push({ kind: "text", text });
  return pieces;
}

/**
 * Text written into a path so that the path sends it as written: each
 * colon doubled and each brace encoded, so that none starts a parameter.
 * A brace is sent encoded either way, as a URL writes it.
 *
 * @param text - The text, as the request sends it
 * @returns The text as a path writes it
 * @example
 * ```ts
 * escapePathText("index:inspect"); // → "index::inspect"
 * escapePathText("{draft}"); // → "%7Bdraft%7D"
 * ```
 */
export function escapePathText(text: string): string {
  return text.replaceAll(":", "::").replaceAll("{", "%7B").replaceAll("}", "%7D");
}

/**
 * The text a parameter's value takes in the path: encoded whole, or — for
 * `{+name}` — part by part between its slashes, which are kept.
 *
 * @param value - The value, as text
 * @param keepsSlashes - Whether the parameter is written `{+name}`
 * @returns The value as the path sends it
 * @example
 * ```ts
 * encodePathValue("a/b c", true); // → "a/b%20c"
 * encodePathValue("a/b c", false); // → "a%2Fb%20c"
 * ```
 */
export function encodePathValue(value: string, keepsSlashes: boolean): string {
  return keepsSlashes
    ? value.split("/").map(encodeURIComponent).join("/")
    : encodeURIComponent(value);
}

/**
 * The part of a parameter's value that would make the path name another
 * route than the one its endpoint declares: empty, `.` or `..` — the whole
 * value, or one of its parts between slashes for `{+name}`. Encoding does
 * not hide them, since URL parsing reads `%2E%2E` as `..` too.
 *
 * @param value - The value, as text
 * @param keepsSlashes - Whether the parameter is written `{+name}`
 * @returns The part, or `undefined` for a value that names no other route
 * @example
 * ```ts
 * routeChangingPart("projects/../admin", true); // → ".."
 * routeChangingPart("a..b", false); // → undefined
 * ```
 */
export function routeChangingPart(value: string, keepsSlashes: boolean): string | undefined {
  const parts = keepsSlashes ? value.split("/") : [value];
  return parts.find((part) => part === "" || part === "." || part === "..");
}
