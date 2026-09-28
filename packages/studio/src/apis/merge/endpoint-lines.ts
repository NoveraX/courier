import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { docCommentBefore } from "../manage/doc-comment-before";
import { findGroupDeclaration } from "../manage/group-declaration";

/** The lines one endpoint of a file takes, counted from 0 on its `\n`-split lines. */
export interface EndpointLines {
  name: string;
  /** Where its doc comment starts; its own first line when it has none. */
  commentStart: number;
  start: number;
  /** Its last line, the one its expression ends on. */
  end: number;
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
  const lineOf = lineFinder(content);
  const result: EndpointLines[] = [];
  for (const property of declaration.endpoints.properties) {
    if (property.type !== "Property" || property.computed) continue;
    const name = propertyKeyName(property.key);
    if (name === null) continue;
    const start = lineOf(property.start);
    const doc = docCommentBefore(content, parsed.comments, property.start);
    const commentStart = doc === null ? start : lineOf(doc.start);
    result.push({ name, commentStart, start, end: lineOf(property.end) });
  }
  return result;
}

/* The line an offset is on, found among the offsets of every `\n`. */
function lineFinder(content: string): (offset: number) => number {
  const breaks: number[] = [];
  for (let at = content.indexOf("\n"); at !== -1; at = content.indexOf("\n", at + 1))
    breaks.push(at);
  return (offset) => {
    let low = 0;
    let high = breaks.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((breaks[middle] ?? Number.POSITIVE_INFINITY) < offset) low = middle + 1;
      else high = middle;
    }
    return low;
  };
}
