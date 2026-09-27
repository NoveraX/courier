/**
 * The endpoint inventory of an import: what its spec offers against what
 * its files hold.
 */

import type { ParsedSpec } from "../apis";
import { computeSpecHash } from "../apis";
import { type ImportLayout, resolveImportLayout } from "../apis/layout";
import { buildEndpointInventory } from "../apis/manage";
import type { DiskGroupListing, EndpointInventory } from "../apis/manage/types";
import { extractEndpoints } from "../apis/merge/extract-endpoints";
import { importBodies } from "./import-files/import-bodies";
import { getImportEntry, getImportState, type ImportsSnapshot } from "./imports-bridge";
import { manageFingerprints } from "./manage-fingerprints";
import type { ProjectRoot } from "./project-fs/project-root";

// ── Inventory ────────────────────────────────────────────────────────────────

interface InventoryRequest {
  name: string;
  newSpec?: ParsedSpec;
}

/**
 * List what an import's spec offers against what its generated files hold.
 *
 * @param body - The import's name, and the spec to compare with
 * @param imports - The declarations of the config Studio runs, with the imports state
 * @param root - The project
 * @returns The inventory, or the error to answer with and its status
 *
 * @example
 * ```ts
 * handleInventory({ name: "pets", newSpec }, importsSnapshotOf(declarations, root), projectRootAt(root));
 * ```
 */
export function handleInventory(
  body: InventoryRequest,
  imports: ImportsSnapshot,
  root: ProjectRoot,
): EndpointInventory | { error: string; status: number } {
  const entry = getImportEntry(imports, body.name);
  if (!entry) return { error: `Source "${body.name}" not found`, status: 404 };
  const state = getImportState(imports, body.name);

  const spec = body.newSpec;
  if (!spec) return { error: "Spec is required for inventory", status: 400 };

  const layout = resolveImportLayout(entry, body.name);
  const existingFiles = importBodies(root, layout.dir);
  const diskGroups = scanSourceGroups(layout, existingFiles);
  const fingerprints = manageFingerprints(state, existingFiles);

  const inventory = buildEndpointInventory(spec, diskGroups, fingerprints, existingFiles);
  inventory.specChanged = computeSpecHash(spec) !== (state?.specHash ?? "");

  return inventory;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/* How a group file names its group, with or without a type on the binding. */
const GROUP_BINDING = /^export const (\w+)\s*(?::[^=]+)?=\s*defineGroup\(/m;
/* The group an import generated as one flat group is written under. */
const FLAT_GROUP = "api";

/**
 * Derive the per-group endpoint listing for an import from the generated
 * files already loaded into `existingFiles`. A group lives in
 * `<dir>/<group-dir>/index.ts`, which names it in its `defineGroup` export;
 * an import generated flat keeps its endpoints in `source.ts`. Endpoint
 * names are read with the same `extractEndpoints()` parser the merge layer uses.
 */
function scanSourceGroups(
  layout: ImportLayout,
  existingFiles: Record<string, string>,
): DiskGroupListing[] {
  const groups: DiskGroupListing[] = [];
  for (const [path, content] of Object.entries(existingFiles)) {
    const name = path === layout.sourceFile ? FLAT_GROUP : groupNameOf(path, content, layout);
    if (name === undefined) continue;
    const endpointNames = Object.keys(extractEndpoints(content));
    if (endpointNames.length === 0) continue;
    groups.push({ name, prefix: "", endpoints: endpointNames });
  }
  return groups;
}

function groupNameOf(path: string, content: string, layout: ImportLayout): string | undefined {
  const name = GROUP_BINDING.exec(content)?.[1];
  return name !== undefined && layout.groupFile(name) === path ? name : undefined;
}
