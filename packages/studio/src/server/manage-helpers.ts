/**
 * Helpers for manage routes — inventory and preview logic.
 */

import { basename } from "node:path";
import type { CourierImportEntry } from "@noverax/courier/config";
import type { ParsedSpec } from "../apis";
import { computeSpecHash } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
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

  const existingFiles = readSourceFiles(entry, body.name);
  const fingerprints = loadSourceFingerprints(existingFiles, state);
  const diskGroups = scanSourceGroups(entry, body.name, existingFiles);

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

  const existingFiles = readSourceFiles(entry, body.name);
  const fingerprints = loadSourceFingerprints(existingFiles, state);

  let addResult: AddResult | undefined;
  let removeResult: RemoveResult | undefined;

  if (Object.keys(body.toAdd).length > 0) {
    addResult = previewAddEndpoints(
      body.spec,
      body.toAdd,
      { ...entry, selectedEndpoints: body.toAdd },
      existingFiles,
    );
  }

  if (Object.keys(body.toRemove).length > 0) {
    removeResult = previewRemoveEndpoints(
      body.toRemove,
      { ...entry, selectedEndpoints: null },
      existingFiles,
      fingerprints,
    );
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

function readSourceFiles(entry: CourierImportEntry, name: string): Record<string, string> {
  const generated = [{ path: "dummy", content: "" }];
  const diskPaths = scanTsFiles(entry, name, generated);
  return readFilesFromDisk(diskPaths);
}

/**
 * Derive the per-group endpoint listing for an import from the generated
 * files already loaded into `existingFiles`. Each generated file lives at
 * `outputDir/{sourceName}/{groupName}.ts` and contains one or more
 * `endpoint(...)` declarations whose names are extracted via the same
 * `extractEndpoints()` parser the merge layer uses.
 */
function scanSourceGroups(
  entry: CourierImportEntry,
  name: string,
  existingFiles: Record<string, string>,
): DiskGroupListing[] {
  const sourceName = entry.sourceName ?? name;
  const sourceDir = `${entry.outputDir.replace(/\/+$/, "")}/${sourceName}`;
  const groups: DiskGroupListing[] = [];
  for (const [path, content] of Object.entries(existingFiles)) {
    if (!path.startsWith(sourceDir)) continue;
    const fileName = basename(path);
    if (!fileName.endsWith(".ts") || fileName === "index.ts") continue;
    const groupName = fileName.slice(0, -3);
    const endpointNames = Object.keys(extractEndpoints(content));
    if (endpointNames.length === 0) continue;
    groups.push({ name: groupName, prefix: "", endpoints: endpointNames });
  }
  return groups;
}
