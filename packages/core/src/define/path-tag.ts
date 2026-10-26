import { encodePathValue, routeChangingPart } from "../utils/path-template";
import { standInName } from "./stand-in";

/** What a closure's wire offers to write a path with values in it. */
export interface PathWriter {
  /**
   * A path with values put into it, for a closure whose path the variables
   * are worked into. The text written around the values is the path as an
   * endpoint declares it — `:id`, `{+name}` and `::` read there as anywhere
   * — and each value put in is text the request sends as it is, encoded, so
   * that none is read as a parameter, a colon, a query or a fragment. A
   * value may not be `undefined` or `null`, nor make its segment — alone or
   * with the text and the values beside it — empty, `.` or `..`, which would
   * name another route.
   *
   * @param strings - The text around the values
   * @param values - The values put into the path
   * @returns The path, as the wire's methods take it
   * @example
   * ```ts
   * // `undefined` after the path: the variables it holds are not sent as its query too
   * endpoint
   *   .variables<{ year: number; month: number }>()
   *   .via((http, { year, month }) =>
   *     http.get(http.path`reports/${year}-${month}/summary`, undefined),
   *   );
   * ```
   */
  path(strings: TemplateStringsArray, ...values: unknown[]): string;
}

/* A character a parameter's name may go on with: `{name}` ends a stand-in's name before it. */
const NAME_CHAR = /^[A-Za-z0-9_]/;
const QUERY_OR_FRAGMENT = /[?#]/;
/* URL parsing reads `%2e` as a dot, so a segment `%2E.` is `..` to it. */
const ENCODED_DOT = /%2e/gi;

type Refusal = (message: string) => Error;

/** A path written with values put into it, and where the text of each value begins in it. */
interface WrittenPath {
  readonly path: string;
  readonly starts: readonly number[];
}

/**
 * The `path` a wire whose calls send the path offers. A value that is
 * missing or that no URL can hold is refused with the error those calls
 * throw for a path's parameters, and so is one that makes its segment —
 * alone or with the text and the values beside it — empty, `.` or `..`.
 *
 * @param refuse - The error for a value the path cannot take
 * @returns The tag
 * @example
 * ```ts
 * const path = pathWriter((message) => new Error(message));
 * path`files/${"a:b"}`; // → "files/a%3Ab"
 * path`reports/${""}.${"."}`; // throws: the segment would be ".."
 * ```
 */
export function pathWriter(refuse: Refusal): PathWriter["path"] {
  const text = (value: unknown): string => checkedText(value, refuse);
  return (strings, ...values) => {
    const { path, starts } = writePath(strings, values, text);
    const segment = routeChangingSegment(path, starts);
    if (segment !== undefined) {
      throw refuse(
        `A value put into the path makes its segment "${segment}", which would change the route`,
      );
    }
    return path;
  };
}

/**
 * The `path` the recorder that probes an endpoint offers. Probing sends
 * nothing, so each value is written as it is — a call checks it when it
 * sends the path — and a stand-in stays the parameter it stands for.
 *
 * @example
 * ```ts
 * probingPath`files/${".."}`; // → "files/.."
 * ```
 */
export const probingPath: PathWriter["path"] = (strings, ...values) =>
  writePath(strings, values, plainText).path;

/* The path with each value in it, and a stand-in as its parameter: braced where a name could go on. */
function writePath(
  strings: readonly string[],
  values: readonly unknown[],
  text: (value: unknown) => string,
): WrittenPath {
  let path = strings[0] ?? "";
  const starts: number[] = [];
  for (const [at, value] of values.entries()) {
    const after = strings[at + 1] ?? "";
    const name = standInName(value);
    if (name === undefined) starts.push(path.length);
    path += (name === undefined ? text(value) : parameterOf(name, after)) + after;
  }
  return { path, starts };
}

function parameterOf(name: string, after: string): string {
  if (name === "") return "";
  return NAME_CHAR.test(after) ? `{${name}}` : `:${name}`;
}

function plainText(value: unknown): string {
  return encodePathValue(String(value), false);
}

/* A value a call sends, refused as a parameter's is where it is missing or no URL can hold it. */
function checkedText(value: unknown, refuse: Refusal): string {
  if (value === undefined || value === null) {
    const text = String(value);
    throw refuse(
      `Missing a value put into the path: it is ${text}, which would be sent as the text "${text}"`,
    );
  }
  try {
    return plainText(value);
  } catch (error) {
    /* Encoding throws for a lone surrogate, which no URL can hold. */
    if (error instanceof URIError) {
      throw refuse(`A value put into the path cannot be encoded: ${error.message}`);
    }
    throw error;
  }
}

/* The first segment before the query that holds a value's text and names another route. */
function routeChangingSegment(path: string, starts: readonly number[]): string | undefined {
  const end = path.search(QUERY_OR_FRAGMENT);
  const local = end < 0 ? path : path.slice(0, end);
  for (const at of starts) {
    if (at > local.length) continue;
    const from = at === 0 ? 0 : local.lastIndexOf("/", at - 1) + 1;
    const to = local.indexOf("/", at);
    const segment = local.slice(from, to < 0 ? local.length : to);
    if (routeChangingPart(segment.replace(ENCODED_DOT, "."), false) !== undefined) return segment;
  }
  return undefined;
}
