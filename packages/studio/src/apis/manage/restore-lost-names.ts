import type { Program } from "oxc-parser";
import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import type { TextEdit } from "../../server/mocks-edit/types";
import { type ExportedKind, exportedNames } from "./exported-names";

/** The text of a module a barrel re-exports, by its specifier, if it exists. */
type ModuleText = (specifier: string) => string | undefined;

type Names = Map<string, ExportedKind>;

/** The modules of an import around a change to its barrel. */
export interface BarrelModules {
  /** Each module's text before the change. */
  before: ModuleText;
  /** Each module's text after it. */
  after: ModuleText;
  /** The group modules that stay, as the barrel names them, in the order a line of their own is added. */
  staying: readonly string[];
}

/**
 * Give back to a barrel the names a change took from it that a module that
 * stays still exports: when a group goes whose `export *` carried names
 * other groups' schemas share, the list another group's module is
 * re-exported by gains them, and a module with no line of its own gets one.
 * No name the barrel did not export before is added.
 *
 * @param path - The barrel, project-relative
 * @param previous - The barrel before the change
 * @param barrel - The barrel after it
 * @param modules - The import's modules before and after the change
 * @returns The barrel with the names given back, or `barrel` when none was lost
 * @example
 * ```ts
 * restoreLostNames("src/api/shop/index.ts", onDisk, withoutPets, { before, after, staying: ["./misc/schemas"] });
 * ```
 */
export function restoreLostNames(
  path: string,
  previous: string,
  barrel: string,
  modules: BarrelModules,
): string {
  const program = parseSource(path, barrel).program;
  const now = barrelNames(program, modules.after);
  const lost: Names = new Map(
    [...barrelNames(parseSource(path, previous).program, modules.before)].filter(
      ([name]) => !now.has(name),
    ),
  );
  const edits = refilledLists(program, lost, modules.after);
  const refilled = edits.length === 0 ? barrel : applyEdits(barrel, edits);
  const lines = newLines(program, lost, modules);
  if (lines.length === 0) return refilled;
  return `${refilled.endsWith("\n") ? refilled : `${refilled}\n`}${lines.join("\n")}\n`;
}

/* A list a module is re-exported by gains the lost names it exports. */
function refilledLists(program: Program, lost: Names, after: ModuleText): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration" || statement.source === null) continue;
    const last = statement.specifiers.at(-1);
    const found = taken(lost, namesOf(after(statement.source.value)));
    if (last === undefined || found.length === 0) continue;
    const added = found.map(([name, kind]) => (kind === "type" ? `, type ${name}` : `, ${name}`));
    edits.push({ start: last.end, end: last.end, text: added.join("") });
  }
  return edits;
}

/* A module the barrel has no line for gets one for the lost names it exports. */
function newLines(program: Program, lost: Names, modules: BarrelModules): string[] {
  const present = new Set(
    program.body.flatMap((s) =>
      (s.type === "ExportAllDeclaration" || s.type === "ExportNamedDeclaration") &&
      s.source !== null
        ? [s.source.value]
        : [],
    ),
  );
  return modules.staying.flatMap((specifier) => {
    if (present.has(specifier)) return [];
    const found = taken(lost, namesOf(modules.after(specifier)));
    const listed = found.map(([name, kind]) => (kind === "type" ? `type ${name}` : name));
    return found.length === 0 ? [] : [`export { ${listed.join(", ")} } from "${specifier}";`];
  });
}

/* The lost names a module exports, which are no longer lost once taken. */
function taken(lost: Names, exported: Names): Array<[string, ExportedKind]> {
  const found = [...exported].filter(([name]) => lost.has(name));
  for (const [name] of found) lost.delete(name);
  return found;
}

/* What a barrel exports: its own lists, and every name of each module it re-exports whole. */
function barrelNames(program: Program, moduleText: ModuleText): Names {
  const names = exportedNames(program.body);
  for (const statement of program.body) {
    if (statement.type !== "ExportAllDeclaration" || statement.exported !== null) continue;
    for (const [name, kind] of namesOf(moduleText(statement.source.value)))
      if (!names.has(name)) names.set(name, kind);
  }
  return names;
}

function namesOf(text: string | undefined): Names {
  return text === undefined
    ? new Map()
    : exportedNames(parseSource("module.ts", text).program.body);
}
