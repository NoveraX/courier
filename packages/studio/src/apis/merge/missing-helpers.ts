import { collectModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import { aboveStatement } from "../manage/above-statement";
import type { DeclarationLayout } from "./declaration-layout";
import type { MergeChange } from "./types";

/**
 * The code a generated file declares below its declaration that the file on
 * disk lacks, such as the reader of the variable an auth middleware sends:
 * the declaration it merges in names it, so a file generated before the spec
 * had auth needs it too. A statement binding a name the file binds already
 * is the file's to keep as it is.
 *
 * @param own - The file on disk, laid out
 * @param fresh - The file the import generated, laid out
 * @param changes - Where each helper added is noted
 * @returns The lines to write after the file's own code, each statement with its comments
 * @example
 * ```ts
 * missingHelpers(own, fresh, changes)[0]; // the helper's doc comment, "/**"
 * ```
 */
export function missingHelpers(
  own: DeclarationLayout,
  fresh: DeclarationLayout,
  changes: MergeChange[],
): string[] {
  const bound = collectModuleBindings(own.parsed.program);
  const { program } = fresh.parsed;
  const below = program.body.slice(program.body.indexOf(fresh.declaration.statement) + 1);
  return below.flatMap((statement) => {
    const names = [...collectModuleBindings({ ...program, body: [statement] }).keys()];
    if (names.length === 0 || names.some((name) => bound.has(name))) return [];
    for (const name of names) {
      changes.push({ type: "added", target: `helper:${name}`, detail: "from spec" });
    }
    const start = aboveStatement(fresh.parsed, statement.start);
    return fresh.parsed.text.slice(start, statement.end).split("\n");
  });
}
