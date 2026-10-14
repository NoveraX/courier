import type { ParsedSource } from "@noverax/courier-cli/devkit";
import type { ObjectExpression } from "oxc-parser";
import { countLineTerminators } from "../mocks-edit/plan/count-line-terminators";
import { detectStyle } from "../mocks-edit/plan/detect-style";
import { planImportLines } from "../mocks-edit/plan/import-lines";
import { insertion } from "../mocks-edit/plan/insertion";
import type { BracedList, ListSite } from "../mocks-edit/plan/list-insertion";
import { collectModuleBindings } from "../mocks-edit/plan/module-bindings";
import { quoteString } from "../mocks-edit/plan/quote-string";
import type { FileStyle } from "../mocks-edit/plan/types";
import type { TextEdit } from "../mocks-edit/types";
import { ConfigEditRefusal } from "./config-edit-refusal";

/** A module read to add to an object it writes, and how the module is written. */
export interface ListTarget {
  parsed: ParsedSource;
  style: FileStyle;
  site: ListSite;
}

/**
 * How a module is written, read from the module and the object Studio adds
 * to, and where in its text entries go.
 *
 * @param parsed - The module, parsed
 * @param object - The object Studio adds to, whose indentation the entries take
 * @returns The module, its style, and the site entries are inserted at
 * @example
 * ```ts
 * const target = listTargetOf(parsed, config);
 * planListInsertion(listOf(config), target.site, render);
 * ```
 */
export function listTargetOf(parsed: ParsedSource, object: ObjectExpression): ListTarget {
  const style = detectStyle(parsed, object);
  const code = parsed.text.trimEnd();
  const singleLineFile = countLineTerminators(code, 0, code.length) === 0;
  const site = {
    text: parsed.text,
    comments: parsed.comments,
    commentEnds: parsed.commentEnds,
    style,
    singleLineFile,
  };
  return { parsed, style, site };
}

/**
 * The line that imports the generated source into a module, after its last
 * import and written as the module writes its own.
 *
 * @param target - The module
 * @param fileName - The module's name, as the messages name it
 * @param source - The name the generated source is exported as, and where it is imported from
 * @returns The insertion
 * @throws {ConfigEditRefusal} `NAME_IN_USE` when the module uses the name already
 * @example
 * ```ts
 * importLine(target, "lib/sources.ts", { binding: "pets", specifier: "../src/api/pets/source" });
 * ```
 */
export function importLine(
  target: ListTarget,
  fileName: string,
  source: { binding: string; specifier: string },
): TextEdit {
  const { parsed, style } = target;
  if (collectModuleBindings(parsed.program).has(source.binding)) {
    throw new ConfigEditRefusal(
      "NAME_IN_USE",
      `${fileName} already uses the name ${source.binding}, which the generated source is exported as.`,
    );
  }
  const statement = `import { ${source.binding} } from ${quoteString(source.specifier, style.quote)}${style.semicolons ? ";" : ""}`;
  const lines = planImportLines(parsed, [statement], style);
  if (lines === null)
    throw new ConfigEditRefusal("PLAN_REJECTED", "Studio planned no import line.");
  return lines.edit;
}

/**
 * An object literal as the list planner takes it: its braces and its entries.
 *
 * @param object - The object
 * @returns The list
 * @example
 * ```ts
 * planListInsertion(listOf(sources), site, render);
 * ```
 */
export function listOf(object: ObjectExpression): BracedList {
  return { open: object.start, close: object.end - 1, items: object.properties };
}

/**
 * Insertions at one offset folded into one, in the order they were planned.
 *
 * @param edits - The insertions
 * @returns The insertions in text order, one per offset
 * @example
 * ```ts
 * const text = applyEdits(input.text, mergeInsertions(edits));
 * ```
 */
export function mergeInsertions(edits: readonly TextEdit[]): TextEdit[] {
  const merged: TextEdit[] = [];
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous !== undefined && previous.start === edit.start) {
      merged[merged.length - 1] = insertion(edit.start, previous.text + edit.text);
    } else {
      merged.push(edit);
    }
  }
  return merged;
}
