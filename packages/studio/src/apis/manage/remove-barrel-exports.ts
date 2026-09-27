import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { lineStart } from "../../server/mocks-edit/plan/line-start";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import type { TextEdit } from "../../server/mocks-edit/types";
import { UnrecognizedFileError } from "./unrecognized-file-error";

/**
 * Drop from an import's barrel the re-exports of modules that are going:
 * those of the groups removed whole, read as code, whatever quotes or lines
 * they are written with. Every other line stays as it is.
 *
 * @param path - The barrel, project-relative
 * @param existing - The barrel on disk, without Studio's header
 * @param specifiers - The modules going, as the barrel names them (`./users/schemas`)
 * @returns The barrel without their re-exports, or `existing` when it has none
 * @throws {UnrecognizedFileError} When the barrel does not parse
 * @example
 * ```ts
 * removeBarrelExports("src/api/pets/index.ts", onDisk, new Set(["./users/schemas", "./users/types"]));
 * ```
 */
export function removeBarrelExports(
  path: string,
  existing: string,
  specifiers: ReadonlySet<string>,
): string {
  const parsed = parseSource(path, existing);
  if (parsed.problem !== null) throw new UnrecognizedFileError(path);
  const edits: TextEdit[] = [];
  for (const statement of parsed.program.body) {
    const isReexport =
      statement.type === "ExportAllDeclaration" || statement.type === "ExportNamedDeclaration";
    if (!isReexport || statement.source === null || !specifiers.has(statement.source.value))
      continue;
    const eol = existing.indexOf("\n", statement.end);
    edits.push({
      start: lineStart(existing, statement.start),
      end: eol === -1 ? existing.length : eol + 1,
      text: "",
    });
  }
  return edits.length === 0 ? existing : applyEdits(existing, edits);
}
