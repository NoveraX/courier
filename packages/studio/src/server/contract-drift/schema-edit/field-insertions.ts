import type { ObjectExpression } from "oxc-parser";

import { countLineTerminators } from "../../mocks-edit/plan/count-line-terminators";
import { detectStyle } from "../../mocks-edit/plan/detect-style";
import { planListInsertion } from "../../mocks-edit/plan/list-insertion";
import type { ParsedSource } from "../../mocks-edit/plan/parse-source";
import type { TextEdit } from "../../mocks-edit/types";

const BARE_KEY = /^[A-Za-z_$][\w$]*$/;

/**
 * The edits that declare fields at the end of an object schema's literal,
 * written as the file writes the rest: on lines of their own, indented like
 * their neighbours, or on the literal's one line, with the file's quotes
 * and trailing commas.
 *
 * @param source - The module, parsed
 * @param literal - The `{…}` of `z.object({…})`
 * @param fields - Each field's name and schema, in the order they go in
 * @returns The insertions
 * @example
 * ```ts
 * fieldInsertions(source, literal, [{ key: "rating", schema: "z.number().optional()" }]);
 * ```
 */
export function fieldInsertions(
  source: ParsedSource,
  literal: ObjectExpression,
  fields: ReadonlyArray<{ readonly key: string; readonly schema: string }>,
): TextEdit[] {
  const { text, comments, commentEnds } = source;
  const style = detectStyle(source);
  const code = text.trimEnd();
  const site = {
    text,
    comments,
    commentEnds,
    style,
    singleLineFile: countLineTerminators(code, 0, code.length) === 0,
  };
  const list = { open: literal.start, close: literal.end - 1, items: literal.properties };
  const entries = fields.map(({ key, schema }) => `${keyText(key, style.quote)}: ${schema}`);
  return planListInsertion(list, site, () => entries);
}

function keyText(key: string, quote: '"' | "'"): string {
  if (BARE_KEY.test(key)) return key;
  const escaped = key.replace(/\\/g, "\\\\").replace(new RegExp(quote, "g"), `\\${quote}`);
  return `${quote}${escaped}${quote}`;
}
