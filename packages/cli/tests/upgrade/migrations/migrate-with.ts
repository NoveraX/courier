import { parseSource } from "../../../src/source/parse-source";
import { programOf } from "../../../src/upgrade/codemod/ast";
import { applyEdits, lineAt } from "../../../src/upgrade/codemod/text-edits";
import type { Migration } from "../../../src/upgrade/migration";

/**
 * A file's text after one migration, and what it found, each with its line.
 *
 * @param migration - The migration
 * @param text - The file's text, TypeScript
 * @returns The text it leaves, its findings and the packages it needs
 */
export function migrateWith(migration: Migration, text: string) {
  const parsed = parseSource("file.ts", text);
  if (parsed.problem !== null) throw new Error(parsed.problem.message);
  const done = migration.migrate({ path: "file.ts", text, program: programOf(parsed.program) });
  const after = applyEdits(text, done.edits);
  const reparsed = parseSource("file.ts", after);
  if (reparsed.problem !== null)
    throw new Error(`the migration's text does not parse: ${reparsed.problem.message}`);
  return {
    text: after,
    findings: done.findings.map((finding) => ({
      line: lineAt(text, finding.at),
      what: finding.what,
      instead: finding.instead,
    })),
    packages: done.packages,
  };
}
