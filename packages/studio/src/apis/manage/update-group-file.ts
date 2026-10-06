/**
 * Add groups inside a group, in the group's generated file, reading it as
 * code: only the group's `groups` entries and their imports change.
 */

import type { ObjectExpression } from "oxc-parser";

import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { detectStyle } from "../../server/mocks-edit/plan/detect-style";
import { planImportLines } from "../../server/mocks-edit/plan/import-lines";
import { planListInsertion } from "../../server/mocks-edit/plan/list-insertion";
import { collectModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { quoteString } from "../../server/mocks-edit/plan/quote-string";
import { unwrapExpression } from "../../server/mocks-edit/plan/unwrap-expression";
import type { TextEdit } from "../../server/mocks-edit/types";
import { findGroupDeclaration } from "./group-declaration";
import { UnrecognizedFileError } from "./unrecognized-file-error";
import { removeEntries, type SourceGroupImport } from "./update-source-file";

/**
 * The object literal listing the groups inside a group: its config's
 * `groups`, when it has one.
 *
 * @param config - The object literal the group is defined with
 * @returns The groups object, or `null` when the group holds none
 * @example
 * ```ts
 * groupsObject(findGroupDeclaration(program, "billing")!.config)?.properties.length; // → 1
 * ```
 */
export function groupsObject(config: ObjectExpression): ObjectExpression | null {
  for (const property of config.properties) {
    if (property.type !== "Property" || property.computed) continue;
    if (propertyKeyName(property.key) !== "groups") continue;
    const value = unwrapExpression(property.value);
    return value.type === "ObjectExpression" ? value : null;
  }
  return null;
}

/**
 * Add groups inside a group: each gets an entry in the group's `groups` —
 * the property added when the group holds none yet — and an import of its
 * module, in the file's own layout and quotes. A group listed already, or a
 * name the file binds already, is not added again.
 *
 * @param path - The group's file, project-relative
 * @param existingContent - The file as it is
 * @param groupName - The group the file declares
 * @param inner - The groups to add inside it
 * @returns The file with them
 * @throws {UnrecognizedFileError} When the file does not parse, or declares no group
 * @example
 * ```ts
 * addGroupsToGroupFile("src/api/shop/billing/index.ts", text, "billing", [
 *   { name: "invoices", local: "invoicesGroup", importPath: "../invoices/index" },
 * ]);
 * ```
 */
export function addGroupsToGroupFile(
  path: string,
  existingContent: string,
  groupName: string,
  inner: readonly SourceGroupImport[],
): string {
  const parsed = parseSource(path, existingContent);
  const declaration =
    parsed.problem === null ? findGroupDeclaration(parsed.program, groupName) : null;
  if (declaration === null) throw new UnrecognizedFileError(path);
  const groups = groupsObject(declaration.config);
  const listed = new Set(
    (groups?.properties ?? []).flatMap((p) =>
      p.type === "Property" && !p.computed ? [propertyKeyName(p.key)] : [],
    ),
  );
  const adding = inner.filter((group) => !listed.has(group.name));
  if (adding.length === 0) return existingContent;
  const bindings = collectModuleBindings(parsed.program);
  const style = detectStyle(parsed, declaration.config);
  const statements = adding
    .filter((group) => !bindings.has(group.local))
    .map((group) => {
      const text = `import { ${group.name} as ${group.local} } from ${quoteString(group.importPath, style.quote)}`;
      return style.semicolons ? `${text};` : text;
    });
  const entries = adding.map((group) => `${group.name}: ${group.local}`);
  const list = groups ?? declaration.config;
  const site = {
    text: existingContent,
    comments: parsed.comments,
    commentEnds: parsed.commentEnds,
    style,
    singleLineFile: false,
  };
  const render = () => (groups ? entries : [`groups: { ${entries.join(", ")} }`]);
  const edits: TextEdit[] = [
    ...planListInsertion(
      { open: list.start, close: list.end - 1, items: list.properties },
      site,
      render,
    ),
  ];
  const lines = planImportLines(parsed, statements, style);
  if (lines !== null) edits.push(lines.edit);
  return applyEdits(
    existingContent,
    edits.sort((a, b) => a.start - b.start),
  );
}

/**
 * Take groups out of the group a file declares: their entries in its
 * `groups`, and the imports only those entries used.
 *
 * @param path - The group's file, project-relative
 * @param existingContent - The file as it is
 * @param names - The groups inside it to take out
 * @returns The file without them
 * @throws {UnrecognizedFileError} When the file does not parse, or declares no group
 * @example
 * ```ts
 * removeGroupsFromGroupFile("src/api/shop/billing/index.ts", text, ["invoices"]);
 * ```
 */
export function removeGroupsFromGroupFile(
  path: string,
  existingContent: string,
  names: readonly string[],
): string {
  const parsed = parseSource(path, existingContent);
  const declaration = parsed.problem === null ? findGroupDeclaration(parsed.program) : null;
  if (declaration === null) throw new UnrecognizedFileError(path);
  const groups = groupsObject(declaration.config);
  if (groups === null) return existingContent;
  return removeEntries(path, existingContent, parsed, groups, names);
}
