/**
 * Add or remove groups in an import's grouped `source.ts`, reading it as
 * code: only the group entries and their imports change.
 */

import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { detectStyle } from "../../server/mocks-edit/plan/detect-style";
import { planImportLines } from "../../server/mocks-edit/plan/import-lines";
import { planListInsertion } from "../../server/mocks-edit/plan/list-insertion";
import { collectModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { quoteString } from "../../server/mocks-edit/plan/quote-string";
import type { TextEdit } from "../../server/mocks-edit/types";
import { dropUnusedImports } from "./drop-unused-imports";
import { planEntryRemoval } from "./entry-removal";
import { findApiGroups } from "./group-declaration";
import { UnrecognizedFileError } from "./unrecognized-file-error";

/** A group to add: its name, the name source.ts imports it under, and the module it lives in. */
export interface SourceGroupImport {
  name: string;
  local: string;
  importPath: string;
}

function parsedSource(path: string, content: string) {
  const parsed = parseSource(path, content);
  const groups = parsed.problem === null ? findApiGroups(parsed.program) : null;
  if (groups === null) throw new UnrecognizedFileError(path);
  return { parsed, groups };
}

/**
 * Add groups to a source file: each gets an entry in `groups` and an
 * import of its module, in the file's own layout and quotes. A group the
 * file lists already, or a name it binds already, is not added again.
 *
 * @param path - The source file, project-relative
 * @param existingContent - The file as it is
 * @param newGroups - The groups to add
 * @returns The file with them
 * @throws {UnrecognizedFileError} When the file does not parse, or lists no groups
 */
export function addGroupsToSourceFile(
  path: string,
  existingContent: string,
  newGroups: SourceGroupImport[],
): string {
  if (newGroups.length === 0) return existingContent;
  const { parsed, groups } = parsedSource(path, existingContent);
  const listed = new Set(
    groups.properties.flatMap((p) =>
      p.type === "Property" && !p.computed ? [propertyKeyName(p.key)] : [],
    ),
  );
  const adding = newGroups.filter((group) => !listed.has(group.name));
  if (adding.length === 0) return existingContent;
  const bindings = collectModuleBindings(parsed.program);
  const style = detectStyle(parsed, groups);
  const statements = adding
    .filter((group) => !bindings.has(group.local))
    .map((group) => {
      const clause = group.local === group.name ? group.name : `${group.name} as ${group.local}`;
      const text = `import { ${clause} } from ${quoteString(group.importPath, style.quote)}`;
      return style.semicolons ? `${text};` : text;
    });
  const list = { open: groups.start, close: groups.end - 1, items: groups.properties };
  const site = {
    text: existingContent,
    comments: parsed.comments,
    commentEnds: parsed.commentEnds,
    style,
    singleLineFile: false,
  };
  const entries = () =>
    adding.map((group) =>
      group.local === group.name ? group.name : `${group.name}: ${group.local}`,
    );
  const edits: TextEdit[] = [...planListInsertion(list, site, entries)];
  const lines = planImportLines(parsed, statements, style);
  if (lines !== null) edits.push(lines.edit);
  return applyEdits(
    existingContent,
    edits.sort((a, b) => a.start - b.start),
  );
}

/**
 * Remove groups from a source file: their entries in `groups` go, and so do
 * the imports only those entries used.
 *
 * @param path - The source file, project-relative
 * @param existingContent - The file as it is
 * @param groupNames - The groups to remove
 * @returns The file without them
 * @throws {UnrecognizedFileError} When the file does not parse, or lists no groups
 */
export function removeGroupsFromSourceFile(
  path: string,
  existingContent: string,
  groupNames: string[],
): string {
  if (groupNames.length === 0) return existingContent;
  const { parsed, groups } = parsedSource(path, existingContent);
  const removing = new Set(groupNames);
  const indices = new Set<number>();
  const locals = new Set<string>();
  groups.properties.forEach((property, at) => {
    if (
      property.type !== "Property" ||
      property.computed ||
      !removing.has(propertyKeyName(property.key) ?? "")
    )
      return;
    indices.add(at);
    if (property.value.type === "Identifier") locals.add(property.value.name);
  });
  if (indices.size === 0) return existingContent;
  const without = applyEdits(
    existingContent,
    planEntryRemoval(parsed, groups.properties, groups.start, indices),
  );
  return dropUnusedImports(path, without, locals);
}
