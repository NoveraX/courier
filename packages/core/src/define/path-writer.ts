import { routeChangingPart } from "../utils/path-template";
import { type PathWriter, plainText, writePath } from "./path-tag";

/* A character a query or a fragment starts with: what a value's segment ends before. */
const QUERY_OR_FRAGMENT = /[?#]/;
/* URL parsing reads `%2e` as a dot, so a segment `%2E.` is `..` to it. */
const ENCODED_DOT = /%2e/gi;

type Refusal = (message: string) => Error;

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
