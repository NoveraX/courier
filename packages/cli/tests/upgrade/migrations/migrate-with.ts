import { parseSource } from "../../../src/source/parse-source";
import { programOf } from "../../../src/upgrade/codemod/ast";
import { applyEdits, lineAt } from "../../../src/upgrade/codemod/text-edits";
import type { Migration, ProjectView } from "../../../src/upgrade/migration";

/** A view of the workspace that tells nothing of a file: a page or the server may load each, as a project the upgrade could not read whole. */
export const UNTOLD: ProjectView = {
  sideOf: () => ({
    page: false,
    maybePage: true,
    maybeServer: true,
    incomplete: true,
    framework: undefined,
  }),
};

/**
 * A file's text after one migration, and what it found, each with its line.
 *
 * @param migration - The migration
 * @param text - The file's text, TypeScript
 * @param project - What the workspace tells of the file
 * @returns The text it leaves, its findings and the packages it needs
 */
export function migrateWith(migration: Migration, text: string, project: ProjectView = UNTOLD) {
  const parsed = parseSource("file.ts", text);
  if (parsed.problem !== null) throw new Error(parsed.problem.message);
  const file = {
    path: "file.ts",
    text,
    program: programOf(parsed.program),
    kind: "module" as const,
    piece: 0,
  };
  const done = migration.migrate(file, project);
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
