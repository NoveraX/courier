import type { ExportAllDeclaration, ExportNamedDeclaration } from "oxc-parser";
import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { exportName } from "../../server/mocks-edit/plan/export-name";
import { lineStart } from "../../server/mocks-edit/plan/line-start";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import type { TextEdit } from "../../server/mocks-edit/types";
import { exportedNames } from "./exported-names";
import { UnrecognizedFileError } from "./unrecognized-file-error";

/**
 * Bring an import's barrel in line with the modules a change removes or
 * rewrites: a re-export of a module that goes is dropped, and one that
 * names what its module no longer exports keeps only the names still there,
 * or goes when none is. Re-exports are read as code, whatever quotes or
 * lines they are written with; every other line stays as it is.
 *
 * @param path - The barrel, project-relative
 * @param existing - The barrel on disk, without Studio's header
 * @param changed - Each module the change touches, as the barrel names it (`./users/schemas`), with its new text, or `null` when it goes
 * @returns The barrel without what no longer resolves, or `existing` when all of it still does
 * @throws {UnrecognizedFileError} When the barrel does not parse
 * @example
 * ```ts
 * removeBarrelExports("src/api/pets/index.ts", onDisk, new Map([["./users/schemas", null]]));
 * ```
 */
export function removeBarrelExports(
  path: string,
  existing: string,
  changed: ReadonlyMap<string, string | null>,
): string {
  const parsed = parseSource(path, existing);
  if (parsed.problem !== null) throw new UnrecognizedFileError(path);
  const edits: TextEdit[] = [];
  for (const statement of parsed.program.body) {
    const isReexport =
      statement.type === "ExportAllDeclaration" || statement.type === "ExportNamedDeclaration";
    if (!isReexport || statement.source === null) continue;
    const text = changed.get(statement.source.value);
    if (text === undefined) continue;
    const edit =
      text === null ? wholeStatement(existing, statement) : narrowed(existing, statement, text);
    if (edit !== null) edits.push(edit);
  }
  return edits.length === 0 ? existing : applyEdits(existing, edits);
}

function wholeStatement(
  existing: string,
  statement: ExportAllDeclaration | ExportNamedDeclaration,
): TextEdit {
  const eol = existing.indexOf("\n", statement.end);
  return {
    start: lineStart(existing, statement.start),
    end: eol === -1 ? existing.length : eol + 1,
    text: "",
  };
}

/* An `export *` follows its module; a list keeps only the names the module still exports. */
function narrowed(
  existing: string,
  statement: ExportAllDeclaration | ExportNamedDeclaration,
  moduleText: string,
): TextEdit | null {
  if (statement.type !== "ExportNamedDeclaration" || statement.source === null) return null;
  const exported = exportedNames(parseSource("module.ts", moduleText).program.body);
  const kept = statement.specifiers.filter((s) => exported.has(exportName(s.local)));
  if (kept.length === statement.specifiers.length) return null;
  if (kept.length === 0) return wholeStatement(existing, statement);
  const first = statement.specifiers[0];
  const last = statement.specifiers.at(-1);
  if (first === undefined || last === undefined) return null;
  return {
    start: first.start,
    end: last.end,
    text: kept.map((s) => existing.slice(s.start, s.end)).join(", "),
  };
}
