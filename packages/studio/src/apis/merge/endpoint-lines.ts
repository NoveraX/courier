import type { Comment, ObjectExpression } from "oxc-parser";

import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { docCommentBefore } from "../manage/doc-comment-before";
import { findGroupDeclaration } from "../manage/group-declaration";
import { lineFinder } from "./line-index";

/** The lines one endpoint of a file takes, counted from 0 on its `\n`-split lines. */
export interface EndpointLines {
  name: string;
  /** Where its doc comment starts; its own first line when it has none. */
  commentStart: number;
  start: number;
  /** Its last line, the one its expression ends on. */
  end: number;
}

/** An entry of an `endpoints` object and its lines; no name for a spread or a computed key. */
export interface EntryLines extends Omit<EndpointLines, "name"> {
  name: string | null;
}

/**
 * Where each endpoint of a group's or a flat API's file is, read from its
 * syntax. Counting brackets line by line, a chain written over several lines
 * was cut at the first line whose brackets balanced, and a bracket inside a
 * comment or a string moved where an endpoint ended.
 *
 * @param content - The file's text
 * @returns Each endpoint the declaration's `endpoints` names, in order; none when there is no declaration
 * @example
 * ```ts
 * endpointLines(file).map((entry) => entry.name); // ["listUsers", "searchUsers"]
 * ```
 */
export function endpointLines(content: string): EndpointLines[] {
  const parsed = parseSource("endpoints.ts", content);
  const declaration = findGroupDeclaration(parsed.program);
  if (declaration === null) return [];
  return entryLines(content, parsed.comments, declaration.endpoints).flatMap(
    ({ name, ...lines }) => (name === null ? [] : [{ name, ...lines }]),
  );
}

/**
 * Every entry of an `endpoints` object, in order, with the lines it and the
 * doc comment right above it take — a spread or a computed key too, with no
 * name, so a reader that keeps entries by name can tell it would lose one.
 *
 * @param content - The file's text
 * @param comments - The comments oxc read from it
 * @param endpoints - The object holding the endpoints
 * @param lineOf - The line of an offset in `content`
 * @returns The entries' lines
 * @example
 * ```ts
 * entryLines(text, parsed.comments, declaration.endpoints).some((entry) => entry.name === null);
 * ```
 */
export function entryLines(
  content: string,
  comments: readonly Comment[],
  endpoints: ObjectExpression,
  lineOf: (offset: number) => number = lineFinder(content),
): EntryLines[] {
  return endpoints.properties.map((property) => {
    const name =
      property.type === "Property" && !property.computed ? propertyKeyName(property.key) : null;
    const start = lineOf(property.start);
    const doc = docCommentBefore(content, comments, property.start);
    const commentStart = doc === null ? start : lineOf(doc.start);
    return { name, commentStart, start, end: lineOf(property.end) };
  });
}
