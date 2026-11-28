import { encodePathValue } from "../utils/encode-path-value";
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

/** A path written with values put into it, and where the text of each value begins in it. */
export interface WrittenPath {
  readonly path: string;
  readonly starts: readonly number[];
}

/**
 * A path with each value put into it as `text` writes it, and a stand-in
 * for a variable as the parameter it stands for — braced where text that
 * a name could go on with follows it. What both writers of a closure's
 * `path` share: the recorder's, which probes an endpoint (`wire-call.ts`),
 * and a call's, which refuses a value its path cannot take (`path-writer.ts`).
 *
 * @param strings - The text around the values
 * @param values - The values put into the path
 * @param text - How a value is written
 * @returns The path, and where the text of each value begins in it
 * @example
 * ```ts
 * writePath(["files/", ""], ["a b"], plainText); // → { path: "files/a%20b", starts: [6] }
 * ```
 */
export function writePath(
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

/**
 * A value as a path holds it: its text, encoded whole.
 *
 * @param value - The value put into the path
 * @returns Its text, encoded
 * @example
 * ```ts
 * plainText("a:b"); // → "a%3Ab"
 * ```
 */
export function plainText(value: unknown): string {
  return encodePathValue(String(value), false);
}
