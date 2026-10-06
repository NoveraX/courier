import type { GroupBy } from "../generator/endpoint-placements";
import { selectedEndpoints, transformSpec } from "../generator/transform-spec";
import type { ImportLayout } from "../layout";
import type { ParsedSpec } from "../parser/types";

/** A group adding endpoints creates, and the group it is generated inside, if any. */
export interface NewGroup {
  name: string;
  parent: string | undefined;
}

/**
 * The groups adding a selection creates: every group generated for it
 * whose file is not on disk yet — a group kept only for the groups inside it
 * among them — each with the group it is generated inside.
 *
 * @param spec - The parsed specification
 * @param groupBy - How the import groups its endpoints
 * @param selection - The endpoints added, as the specification names them
 * @param existingFiles - The import's files as they are, by path
 * @param layout - Where the import's files are
 * @returns The new groups, outer ones before the groups inside them
 * @example
 * ```ts
 * newGroupsOf(spec, "tag", { lines: ["listLines"] }, files, layout); // → [{ name: "lines", parent: "invoices" }]
 * ```
 */
export function newGroupsOf(
  spec: ParsedSpec,
  groupBy: GroupBy,
  selection: Record<string, string[]>,
  existingFiles: Record<string, string>,
  layout: ImportLayout,
): NewGroup[] {
  if (groupBy === "single") return [];
  const generated = transformSpec(spec, { groupBy }, selectedEndpoints(spec.groups, selection));
  return generated.groups
    .filter((group) => !Object.hasOwn(existingFiles, layout.groupFile(group.name)))
    .map((group) => ({ name: group.name, parent: group.parent }));
}
