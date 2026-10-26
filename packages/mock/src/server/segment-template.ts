import { type PathPiece, pathPieces } from "@noverax/courier/internal";

/**
 * How a segment of a path is written: as text, as one parameter, as
 * parameters beside text, or as one `{+name}`, whose value spans segments.
 */
export type SegmentKind = "text" | "param" | "mixed" | "spans";

/** What a segment of a path holds and how a request's segment matches it. */
interface SegmentMatching {
  /** The segment's parameters, in order */
  readonly names: readonly string[];
  /** The segment as a pattern with no group in it, each parameter any text but a slash — or any text, for `{+name}` */
  readonly pattern: string;
  /** The same pattern with a group for each parameter, in order, for a reader that matches a whole path */
  readonly capture: string;
  /** The values of the segment's parameters in a segment it matches, or `undefined` for one it does not */
  readonly match: (segment: string) => readonly string[] | undefined;
}

/**
 * One segment of an endpoint's path, as a mock server matches requests
 * against it: text, which `::` writes a colon in; one parameter, which takes
 * the whole segment; parameters beside text, as Google's `:name::cancel` or
 * a range's `:from-:to`; or one `{+name}`, which takes the segments its
 * value's slashes divide.
 */
export type SegmentTemplate = SegmentMatching &
  (
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "param" | "spans"; readonly name: string }
    | { readonly kind: "mixed" }
  );

const PLAIN = /^[A-Za-z0-9_-]$/;
const RANK: Readonly<Record<SegmentKind, string>> = {
  text: "0",
  mixed: "1",
  param: "2",
  spans: "3",
};
/* Ends every key, ranked after every segment: a path that goes on past where another ends sorts first. */
const END = "4";

/**
 * Read one segment of a path.
 *
 * @param segment - The segment, as the path writes it
 * @returns How it reads, and how a request's segment matches it
 * @example
 * ```ts
 * segmentTemplate(":name::cancel").match("op-1:cancel"); // → ["op-1"]
 * segmentTemplate("index::inspect").match("index:inspect"); // → []
 * ```
 */
export function segmentTemplate(segment: string): SegmentTemplate {
  const pieces = pathPieces(segment);
  const names = pieces.flatMap((piece) => (piece.kind === "param" ? [piece.name] : []));
  const [first] = pieces;
  if (pieces.length === 1 && first?.kind === "param") {
    const kind = first.keepsSlashes ? "spans" : "param";
    const pattern = first.keepsSlashes ? ".+" : "[^/]+";
    const match = (value: string) => [value];
    return { kind, name: first.name, names, pattern, capture: `(${pattern})`, match };
  }
  if (names.length === 0) {
    const text = first?.kind === "text" ? first.text : "";
    const match = (value: string) => (value === text ? [] : undefined);
    return { kind: "text", text, names, pattern: literal(text), capture: literal(text), match };
  }
  const split = new RegExp(`^${patternOf(pieces, "(.+?)", "(.+?)")}$`);
  const match = (value: string) => split.exec(value)?.slice(1);
  const capture = patternOf(pieces, "([^/]+?)", "(.+?)");
  return { kind: "mixed", names, pattern: patternOf(pieces, "[^/]+", ".+"), capture, match };
}

/**
 * How a segment of a path is written, read without the pattern a request's
 * segment is matched by — for a reader that asks this of many paths.
 *
 * @param segment - The segment, as the path writes it
 * @returns Its kind
 * @example
 * ```ts
 * segmentKind("index::inspect"); // → "text"
 * segmentKind(":name::cancel"); // → "mixed"
 * ```
 */
export function segmentKind(segment: string): SegmentKind {
  const pieces = pathPieces(segment);
  if (!pieces.some((piece) => piece.kind === "param")) return "text";
  const [first] = pieces;
  if (pieces.length > 1) return "mixed";
  return first?.kind === "param" && first.keepsSlashes ? "spans" : "param";
}

/**
 * How specific a path is, segment by segment: text before parameters beside
 * text, before a parameter alone, before a `{+name}` — the order a mock
 * server tries its routes in, so that `users/stats` is never taken for
 * `users/:id`. A path that goes on past where another ends comes first, as
 * the `{+name}` the other may end with would take its requests too: Google's
 * list `{+parent}/services` before its get `{+name}`.
 *
 * @param path - The path
 * @returns A key that sorts the more specific path first
 * @example
 * ```ts
 * specificity("users/stats") < specificity("users/:id"); // → true
 * specificity("{+parent}/services") < specificity("{+name}"); // → true
 * ```
 */
export function specificity(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return `${segments.map((segment) => RANK[segmentKind(segment)]).join("")}${END}`;
}

/* The segment's pattern: each parameter as `param`, or as `spans` for a `{+name}`, its text as written. */
function patternOf(pieces: readonly PathPiece[], param: string, spans: string): string {
  return pieces
    .map((piece) => {
      if (piece.kind === "text") return literal(piece.text);
      return piece.keepsSlashes ? spans : param;
    })
    .join("");
}

/* Text a pattern matches as written: every character but a letter, a digit, `_` and `-` by its
   code, so that neither the pattern nor a router's route syntax reads anything in it. */
function literal(text: string): string {
  let pattern = "";
  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at);
    pattern += PLAIN.test(char) ? char : `\\u${text.charCodeAt(at).toString(16).padStart(4, "0")}`;
  }
  return pattern;
}
