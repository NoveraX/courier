/**
 * The endpoint inventory of an import: what its spec offers against what
 * its files hold.
 */

import type { ParsedSpec } from "../apis";
import { computeSpecHash } from "../apis";
import { transformSpec } from "../apis/generator/transform-spec";
import { resolveImportLayout } from "../apis/layout";
import { buildEndpointInventory } from "../apis/manage";
import { diskListing } from "../apis/manage/disk-listing";
import type { EndpointInventory } from "../apis/manage/types";
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
 * @param specHash - The hash of the spec as sent, when the declaration reshaped it
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
  specHash?: string,
): EndpointInventory | { error: string; status: number } {
  const entry = getImportEntry(imports, body.name);
  if (!entry) return { error: `Source "${body.name}" not found`, status: 404 };
  const state = getImportState(imports, body.name);

  const spec = body.newSpec;
  if (!spec) return { error: "Spec is required for inventory", status: 400 };

  const layout = resolveImportLayout(entry, body.name);
  const existingFiles = importBodies(root, layout.dir);
  const diskGroups = diskListing(layout, existingFiles);
  const fingerprints = manageFingerprints(state, existingFiles);

  /* Listed as the import's files hold them: by its grouping, under the names it generates. */
  const listed = transformSpec(spec, { groupBy: entry.groupBy ?? "tag" });
  const inventory = buildEndpointInventory(listed, diskGroups, fingerprints, existingFiles);
  inventory.specChanged = (specHash ?? computeSpecHash(spec)) !== (state?.specHash ?? "");

  return inventory;
}
