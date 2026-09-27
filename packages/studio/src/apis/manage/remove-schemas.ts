import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import type { TextEdit } from "../../server/mocks-edit/types";
import { dropUnusedImports } from "./drop-unused-imports";
import { readSchemaFile, type SchemaStatement } from "./schema-file";

/**
 * Remove declarations from a schemas or types file, read as code: each goes
 * with its comments and the blank line after it. What only they needed goes
 * too — a helper such as ArkType's cycle helper, a statement that sets it,
 * an import name — and everything else stays as it is.
 *
 * @param schemaContent - The file, without Studio's header
 * @param orphanNames - The names to remove
 * @returns The file without them; `null` when no declaration is left, so the file goes; the file as it is when it does not parse
 * @example
 * ```ts
 * removeOrphanSchemas(schemas, ["Pet", "PetSchema"]);
 * ```
 */
export function removeOrphanSchemas(
  schemaContent: string,
  orphanNames: readonly string[],
): string | null {
  if (orphanNames.length === 0) return schemaContent;
  const statements = readSchemaFile("schemas.ts", schemaContent);
  if (statements === null) return schemaContent;
  const gone = new Set(orphanNames);
  const declarations = statements.filter((s) => s.kind === "declaration");
  const staying = declarations.filter((s) => !s.binds.every((name) => gone.has(name)));
  if (staying.length === 0) return null;
  const helpers = statements.filter((s) => s.kind === "helper");
  const keptHelpers = helpersStaying(staying, helpers);
  const dropped = statements.filter(
    (s) => s.kind !== "import" && !staying.includes(s) && !keptHelpers.has(s),
  );
  if (dropped.length === 0) return schemaContent;
  const edits: TextEdit[] = dropped.map((s) => ({
    start: s.start,
    end: withBlankLineAfter(schemaContent, s.end),
    text: "",
  }));
  const candidates = new Set(dropped.flatMap((s) => [...s.references]));
  return dropUnusedImports("schemas.ts", applyEdits(schemaContent, edits), candidates);
}

/* The helpers something that stays still needs, found until nothing more is. */
function helpersStaying(
  staying: readonly SchemaStatement[],
  helpers: readonly SchemaStatement[],
): Set<SchemaStatement> {
  const kept = new Set<SchemaStatement>();
  const used = new Set(staying.flatMap((s) => [...s.references]));
  let grew = true;
  while (grew) {
    grew = false;
    for (const helper of helpers) {
      if (kept.has(helper) || !helper.binds.some((name) => used.has(name))) continue;
      kept.add(helper);
      for (const name of helper.references) used.add(name);
      grew = true;
    }
  }
  /* A statement binding nothing, such as `declared = true;`, stays while what it sets does. */
  const keptNames = new Set([...kept].flatMap((s) => s.binds));
  const bound = new Set(helpers.flatMap((s) => s.binds));
  for (const helper of helpers) {
    if (helper.binds.length > 0) continue;
    const sets = [...helper.references].filter((name) => bound.has(name));
    if (sets.length === 0 || sets.some((name) => keptNames.has(name))) kept.add(helper);
  }
  return kept;
}

function withBlankLineAfter(text: string, end: number): number {
  const eol = text.indexOf("\n", end);
  const next = eol === -1 ? text.length : eol + 1;
  return text.slice(end, next).trim() === "" && next > end ? next : end;
}
