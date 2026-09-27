import type { Program } from "oxc-parser";
import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import type { TextEdit } from "../../server/mocks-edit/types";
import { type ExportedKind, exportedNames } from "./exported-names";

/** The text of a module a barrel re-exports, by its specifier, if it exists. */
type ModuleText = (specifier: string) => string | undefined;

/**
 * Give back to a barrel the names a change took from it that a module it
 * still re-exports by name exports: when a group goes whose `export *`
 * carried names another group's schemas share, the other group's list,
 * written without them, gains them. No name the barrel did not export
 * before is added.
 *
 * @param path - The barrel, project-relative
 * @param previous - The barrel before the change
 * @param barrel - The barrel after it
 * @param before - Each module's text before the change
 * @param after - Each module's text after it
 * @returns The barrel with the names given back, or `barrel` when none was lost
 * @example
 * ```ts
 * restoreLostNames("src/api/shop/index.ts", onDisk, withoutPets, (s) => old[s], (s) => now[s]);
 * ```
 */
export function restoreLostNames(
  path: string,
  previous: string,
  barrel: string,
  before: ModuleText,
  after: ModuleText,
): string {
  const program = parseSource(path, barrel).program;
  const now = barrelNames(program, after);
  const lost = new Map(
    [...barrelNames(parseSource(path, previous).program, before)].filter(
      ([name]) => !now.has(name),
    ),
  );
  const edits: TextEdit[] = [];
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration" || statement.source === null) continue;
    const last = statement.specifiers.at(-1);
    const found = [...namesOf(after(statement.source.value))].filter(([name]) => lost.has(name));
    if (last === undefined || found.length === 0) continue;
    for (const [name] of found) lost.delete(name);
    const added = found.map(([name, kind]) => (kind === "type" ? `, type ${name}` : `, ${name}`));
    edits.push({ start: last.end, end: last.end, text: added.join("") });
  }
  return edits.length === 0 ? barrel : applyEdits(barrel, edits);
}

/* What a barrel exports: its own lists, and every name of each module it re-exports whole. */
function barrelNames(program: Program, moduleText: ModuleText): Map<string, ExportedKind> {
  const names = exportedNames(program.body);
  for (const statement of program.body) {
    if (statement.type !== "ExportAllDeclaration" || statement.exported !== null) continue;
    for (const [name, kind] of namesOf(moduleText(statement.source.value)))
      if (!names.has(name)) names.set(name, kind);
  }
  return names;
}

function namesOf(text: string | undefined): Map<string, ExportedKind> {
  return text === undefined
    ? new Map()
    : exportedNames(parseSource("module.ts", text).program.body);
}
