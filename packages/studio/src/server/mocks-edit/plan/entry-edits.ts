import type { ObjectExpression } from "oxc-parser";
import type { MockDeclaration, TextEdit } from "../types";
import { countLineTerminators } from "./count-line-terminators";
import { insertion } from "./insertion";
import { planListInsertion } from "./list-insertion";
import type { LocatedMocks } from "./locate-mocks-object";
import { mocksExport } from "./mocks-export";
import type { ParsedSource } from "./parse-source";
import type { ImportPlan } from "./plan-imports";
import { renderEntry } from "./render-entry";
import { separatorBefore } from "./separator-before";
import type { EntryContext } from "./types";

/** The insertions that write the new entries, and any statement they add. */
export interface EntryEdits {
  edits: TextEdit[];
  /** The default export appended to a file without one, exactly as inserted. */
  statements: string[];
}

/**
 * Plan where the new entries go: into the mocks object when the file has
 * one, or into a default export appended at the end of a file without one,
 * after a blank line and ending with a line break.
 *
 * @param parsed - The parsed mocks file
 * @param located - Its mocks object, or `absent`
 * @param imports - The imports the edit adds, some of which may also go at the end
 * @param requests - The mocks to declare
 * @param ctx - How entries are written in the file
 * @returns The insertions, and the statement appended if any
 *
 * @example
 * ```ts
 * planEntryEdits(parsed, { kind: "absent" }, imports, requests, ctx).statements;
 * // → ["export default defineMocks({\n  api: defineMockServer({ source: courierConfig.sources.api }),\n});"]
 * ```
 */
export function planEntryEdits(
  parsed: ParsedSource,
  located: LocatedMocks,
  imports: ImportPlan,
  requests: readonly MockDeclaration[],
  ctx: EntryContext,
): EntryEdits {
  if (located.kind === "object") {
    return { edits: intoObject(parsed, located.object, requests, ctx), statements: [] };
  }
  return appended(parsed, imports, requests, ctx);
}

function intoObject(
  parsed: ParsedSource,
  object: ObjectExpression,
  requests: readonly MockDeclaration[],
  ctx: EntryContext,
): TextEdit[] {
  const { text, comments, commentEnds } = parsed;
  const list = { open: object.start, close: object.end - 1, items: object.properties };
  const code = text.trimEnd();
  const singleLineFile = countLineTerminators(code, 0, code.length) === 0;
  const site = { text, comments, commentEnds, style: ctx.style, singleLineFile };
  return planListInsertion(list, site, (indent, block) =>
    requests.map((request) => renderEntry(request, ctx, indent, block)),
  );
}

/* Imports inserted at the very end come first there, so the blank line
   before the export is judged against them too. */
function appended(
  parsed: ParsedSource,
  imports: ImportPlan,
  requests: readonly MockDeclaration[],
  ctx: EntryContext,
): EntryEdits {
  const { style } = ctx;
  const end = parsed.text.length;
  const atEnd = imports.edits.filter((edit) => edit.start === end).map((edit) => edit.text);
  const entries = requests.map((request) => renderEntry(request, ctx, style.indent, true));
  const statement = mocksExport(imports.mocksCallee ?? "defineMocks", entries, style);
  const before = parsed.text + atEnd.join("");
  const edit = insertion(end, separatorBefore(before, style.eol) + statement + style.eol);
  return { edits: [edit], statements: [statement] };
}
