import type { ImportLayout } from "../layout";
import { extractEndpoints } from "../merge/extract-endpoints";
import { TOP_LEVEL } from "../parser/top-level";
import type { DiskGroupListing } from "./types";

/* How a group file names its group, with or without a type on the binding. */
const GROUP_BINDING = /^export const (\w+)\s*(?::[^=]+)?=\s*defineGroup\(/m;

/**
 * The endpoints an import's files hold, by the group that holds them: a
 * group lives in `<dir>/<group-dir>/index.ts`, which names it in its
 * `defineGroup` export; the API's own endpoints are in `source.ts`, listed
 * under `""`. Names are read with the parser the merge layer uses.
 *
 * @param layout - Where the import's files are
 * @param files - The import's files, by path
 * @returns Each group that holds an endpoint, with their names and its file
 * @example
 * ```ts
 * diskListing(layout, files).map((group) => group.name); // ["", "pets"]
 * ```
 */
export function diskListing(
  layout: ImportLayout,
  files: Readonly<Record<string, string>>,
): DiskGroupListing[] {
  const groups: DiskGroupListing[] = [];
  for (const [path, content] of Object.entries(files)) {
    const name = path === layout.sourceFile ? TOP_LEVEL : groupNameOf(path, content, layout);
    if (name === undefined) continue;
    const endpointNames = Object.keys(extractEndpoints(content));
    if (endpointNames.length === 0) continue;
    groups.push({ name, prefix: "", endpoints: endpointNames, file: path });
  }
  return groups;
}

function groupNameOf(path: string, content: string, layout: ImportLayout): string | undefined {
  const name = GROUP_BINDING.exec(content)?.[1];
  return name !== undefined && layout.groupFile(name) === path ? name : undefined;
}
