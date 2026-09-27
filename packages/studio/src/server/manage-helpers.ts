/**
 * Helpers for manage routes — inventory and preview logic.
 */

import type { ParsedSpec } from "../apis";
import { computeSpecHash } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { type ImportLayout, resolveImportLayout } from "../apis/layout";
import {
  buildEndpointInventory,
  previewAddEndpoints,
  previewRemoveEndpoints,
} from "../apis/manage";
import type {
  AddResult,
  DiskGroupListing,
  EndpointInventory,
  RemoveResult,
} from "../apis/manage/types";
import { extractEndpoints } from "../apis/merge/extract-endpoints";
import { getImportEntry, getImportState, type ImportsSnapshot } from "./imports-bridge";
import { buildFallbackFingerprints, readFilesFromDisk } from "./registry-helpers";
import { scanTsFiles } from "./scan-ts-files";

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
 * @returns The inventory, or the error to answer with and its status
 *
 * @example
 * ```ts
 * handleInventory({ name: "pets", newSpec }, importsSnapshotOf(declarations, root));
 * ```
 */
export function handleInventory(
  body: InventoryRequest,
  imports: ImportsSnapshot,
): EndpointInventory | { error: string; status: number } {
  const entry = getImportEntry(imports, body.name);
  if (!entry) return { error: `Source "${body.name}" not found`, status: 404 };
  const state = getImportState(imports, body.name);

  const spec = body.newSpec;
  if (!spec) return { error: "Spec is required for inventory", status: 400 };

  const layout = resolveImportLayout(entry, body.name);
  const existingFiles = readSourceFiles(layout);
  const fingerprints = loadSourceFingerprints(existingFiles, state);
  const diskGroups = scanSourceGroups(layout, existingFiles);

  const inventory = buildEndpointInventory(spec, diskGroups, fingerprints, existingFiles);
  inventory.specChanged = computeSpecHash(spec) !== (state?.specHash ?? "");

  return inventory;
}

// ── Preview ──────────────────────────────────────────────────────────────────

interface ManagePreviewRequest {
  name: string;
  spec: ParsedSpec;
  toAdd: Record<string, string[]>;
  toRemove: Record<string, string[]>;
}

/** The files adding and removing endpoints would write and delete. */
export interface ManagePreviewResponse {
  addResult?: AddResult;
  removeResult?: RemoveResult;
}

/**
 * Preview adding and removing endpoints of an import, without writing anything.
 *
 * @param body - The import's name, its spec, and the endpoints to add and remove by group
 * @param imports - The declarations of the config Studio runs, with the imports state
 * @returns The preview, or the error to answer with and its status
 *
 * @example
 * ```ts
 * handleManagePreview({ name: "pets", spec, toAdd: { pets: ["listPets"] }, toRemove: {} }, imports);
 * ```
 */
export function handleManagePreview(
  body: ManagePreviewRequest,
  imports: ImportsSnapshot,
): ManagePreviewResponse | { error: string; status: number } {
  const entry = getImportEntry(imports, body.name);
  if (!entry) return { error: `Source "${body.name}" not found`, status: 404 };
  const state = getImportState(imports, body.name);

  const layout = resolveImportLayout(entry, body.name);
  const existingFiles = readSourceFiles(layout);
  const fingerprints = loadSourceFingerprints(existingFiles, state);

  let addResult: AddResult | undefined;
  let removeResult: RemoveResult | undefined;

  if (Object.keys(body.toAdd).length > 0) {
    addResult = previewAddEndpoints(
      body.spec,
      body.toAdd,
      { ...entry, selectedEndpoints: body.toAdd },
      existingFiles,
      layout,
    );
  }

  if (Object.keys(body.toRemove).length > 0) {
    removeResult = previewRemoveEndpoints(body.toRemove, existingFiles, fingerprints, layout);
  }

  return { addResult, removeResult };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function loadSourceFingerprints(
  existingFiles: Record<string, string>,
  state: ImportStateEntry | undefined,
): Record<string, string> {
  const cached = state?.fileFingerprints ?? {};
  if (Object.keys(cached).length > 0) return cached;
  return buildFallbackFingerprints(existingFiles, state?.userModified ?? []);
}

function readSourceFiles(layout: ImportLayout): Record<string, string> {
  return readFilesFromDisk(scanTsFiles(layout, []));
}

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
