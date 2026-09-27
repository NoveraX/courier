import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import type { TextEdit } from "../../server/mocks-edit/types";
import { readSchemaFile, type SchemaStatement } from "./schema-file";
import { UnrecognizedFileError } from "./unrecognized-file-error";

/**
 * Add to a schemas or types file on disk the declarations a freshly
 * generated one has that it lacks, read as code: each comes with its
 * comments, and with what it needs that the file does not have — an import,
 * or a helper such as ArkType's cycle helper and the statement that arms
 * it. New declarations go before that statement when the file has it, as
 * the generator writes them; everything already there stays as it is.
 *
 * @param path - The file, project-relative, to name in a refusal
 * @param existingContent - The file on disk, without Studio's header
 * @param generatedContent - The file generated for the endpoints being added
 * @param newSchemaNames - The names to take from the generated file
 * @returns The file with them added, or `existingContent` when nothing is new
 * @throws {UnrecognizedFileError} When either file does not parse
 * @example
 * ```ts
 * mergeSchemaFiles("src/api/shop/pets/schemas.ts", onDisk, generated, ["Toy", "ToySchema"]);
 * ```
 */
export function mergeSchemaFiles(
  path: string,
  existingContent: string,
  generatedContent: string,
  newSchemaNames: readonly string[],
): string {
  if (newSchemaNames.length === 0) return existingContent;
  const existing = readSchemaFile(path, existingContent);
  const generated = readSchemaFile(path, generatedContent);
  if (existing === null || generated === null) throw new UnrecognizedFileError(path);
  const present = new Set(existing.flatMap((s) => s.binds));
  const wanted = new Set(newSchemaNames);
  const added = generated.filter(
    (s) =>
      s.kind === "declaration" &&
      s.binds.some((name) => wanted.has(name)) &&
      !s.binds.some((name) => present.has(name)),
  );
  if (added.length === 0) return existingContent;
  const helpers = neededHelpers(added, generated, present);
  const textOf = (s: SchemaStatement): string => generatedContent.slice(s.start, s.end).trimEnd();
  const imports = generated.filter(
    (s) => s.kind === "import" && s.binds.length > 0 && !s.binds.every((name) => present.has(name)),
  );
  const lastImport = existing.filter((s) => s.kind === "import").at(-1);
  const arming = existing.find((s) => s.kind === "helper" && s.binds.length === 0);
  const head = [...imports, ...helpers.defining].map(textOf);
  const headAt = lastImport?.end ?? 0;
  const body = [...added, ...(arming === undefined ? helpers.arming : [])].map(textOf);
  const edits: TextEdit[] = [];
  if (head.length > 0) edits.push({ start: headAt, end: headAt, text: `${head.join("\n")}\n` });
  if (arming !== undefined) {
    edits.push({ start: arming.start, end: arming.start, text: `${body.join("\n\n")}\n\n` });
  } else {
    const gap = existingContent.endsWith("\n") ? "\n" : "\n\n";
    const at = existingContent.length;
    edits.push({ start: at, end: at, text: `${gap}${body.join("\n\n")}\n` });
  }
  return applyEdits(existingContent, edits);
}

/* The helpers the added declarations need that the file lacks, and the statements that arm them. */
function neededHelpers(
  added: readonly SchemaStatement[],
  generated: readonly SchemaStatement[],
  present: ReadonlySet<string>,
): { defining: SchemaStatement[]; arming: SchemaStatement[] } {
  const helpers = generated.filter((s) => s.kind === "helper");
  const needed = new Set<SchemaStatement>();
  const used = new Set(added.flatMap((s) => [...s.references]));
  let grew = true;
  while (grew) {
    grew = false;
    for (const helper of helpers) {
      if (needed.has(helper) || helper.binds.length === 0) continue;
      if (!helper.binds.some((name) => used.has(name) && !present.has(name))) continue;
      needed.add(helper);
      for (const name of helper.references) used.add(name);
      grew = true;
    }
  }
  const bound = new Set([...needed].flatMap((s) => s.binds));
  const arming = helpers.filter(
    (s) => s.binds.length === 0 && [...s.references].some((name) => bound.has(name)),
  );
  return { defining: helpers.filter((s) => needed.has(s)), arming };
}
