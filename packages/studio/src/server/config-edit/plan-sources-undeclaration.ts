import { planEntryRemoval } from "../../apis/manage/entry-removal";
import { applyEdits } from "../mocks-edit/plan/apply-edits";
import { parseSource } from "../mocks-edit/plan/parse-source";
import { propertyKeyName } from "../mocks-edit/plan/property-key-name";
import { unwrapExpression } from "../mocks-edit/plan/unwrap-expression";
import { ConfigEditRefusal } from "./config-edit-refusal";
import type { ConfigUndeclarationPlan } from "./config-undeclaration-types";
import { exportedObject } from "./exported-object";
import { emptied } from "./list-entry-removals";
import { unusedImports } from "./plan-config-undeclaration";
import { keysOf, parsedList } from "./plan-sources-declaration";

/** What taking an import out of the module the config takes its `sources` from removes. */
export interface SourcesUndeclarationInput {
  /** The module, relative to the project root, as the messages name it. */
  fileName: string;
  /** Its text as read. */
  text: string;
  /** The name it exports the list under, `default` for its default export. */
  exportName: string;
  /** The import's name: its key in the list. */
  name: string;
}

/**
 * Plan the change that takes an import out of the module the config takes
 * its `sources` from: its entry in the list, with its doc comment and its
 * comma, and the imports of names only that entry used. A list left empty
 * reads `{}`. The module only ever loses text, and the result is read back
 * as no longer listing the import before it is returned.
 *
 * @param input - The module as read, and what to take out
 * @returns The module as changed, and the removals; `null` when the list does not name the import
 * @throws {ConfigEditRefusal} When Studio should leave the change to the developer
 * @example
 * ```ts
 * const plan = planSourcesUndeclaration({
 *   fileName: "lib/sources.ts",
 *   text: 'import { api } from "./api";\nimport { pets } from "../src/api/pets/source";\nexport const sources = { api, pets };\n',
 *   exportName: "sources",
 *   name: "pets",
 * });
 * plan?.text; // → 'import { api } from "./api";\nexport const sources = { api };\n'
 * ```
 */
export function planSourcesUndeclaration(
  input: SourcesUndeclarationInput,
): ConfigUndeclarationPlan | null {
  const { fileName, name } = input;
  const { parsed, list } = parsedList(fileName, input.text, input.exportName);
  const items = list.properties;
  const going = new Set<number>();
  const locals = new Set<string>();
  items.forEach((property, at) => {
    if (property.type !== "Property" || property.computed) return;
    if (propertyKeyName(property.key) !== name) return;
    going.add(at);
    const value = unwrapExpression(property.value);
    if (value.type === "Identifier") locals.add(value.name);
  });
  if (going.size === 0) return null;
  const removed = planEntryRemoval(parsed, items, list.start, going);
  const entries = going.size < items.length ? removed : emptied(parsed.text, list, removed);
  const unused = unusedImports({ fileName, text: input.text, parsed }, entries, locals);
  const edits = [...entries, ...unused].sort((a, b) => a.start - b.start);
  if (edits.some((edit, at) => at > 0 && edit.start < (edits[at - 1]?.end ?? 0))) {
    throw new ConfigEditRefusal(
      "PLAN_REJECTED",
      `Studio planned removals from ${fileName} that overlap, so it changed nothing.`,
    );
  }
  const text = applyEdits(input.text, edits);
  verifyUnlisted(text, input);
  return { text, edits };
}

/* The planned module still parses, and its list no longer names the import. */
function verifyUnlisted(text: string, input: SourcesUndeclarationInput): void {
  const parsed = parseSource(input.fileName, text);
  const found = parsed.problem === null ? exportedObject(parsed.program, input.exportName) : null;
  if (found?.kind === "object" && !keysOf(found.object).has(input.name)) return;
  throw new ConfigEditRefusal(
    "PLAN_REJECTED",
    `Studio planned a change to ${input.fileName} that did not read back as no longer listing ${input.name}, so it changed nothing.`,
  );
}
