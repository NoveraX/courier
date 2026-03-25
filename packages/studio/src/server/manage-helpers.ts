/**
 * Helpers for manage routes — inventory and preview logic.
 */

import type { ParsedSpec } from "../apis";
import {
  computeSpecHash,
  getCachedFingerprints,
  getSource,
  loadCache,
  loadRegistry,
  scanProject,
} from "../apis";
import {
  buildEndpointInventory,
  previewAddEndpoints,
  previewRemoveEndpoints,
} from "../apis/manage";
import type { AddResult, EndpointInventory, RemoveResult } from "../apis/manage/types";
import type { RegistrySource } from "../apis/registry/types";
import { buildFallbackFingerprints, readFilesFromDisk } from "./registry-helpers";
import { scanTsFiles } from "./scan-ts-files";

// ── Inventory ────────────────────────────────────────────────────────────────

interface InventoryRequest {
  name: string;
  newSpec?: ParsedSpec;
  configPath?: string;
}

export function handleInventory(
  body: InventoryRequest,
): EndpointInventory | { error: string; status: number } {
  const config = loadRegistry(body.configPath);
  const source = getSource(config, body.name);
  if (!source) return { error: `Source "${body.name}" not found`, status: 404 };

  const spec = body.newSpec;
  if (!spec) return { error: "Spec is required for inventory", status: 400 };

  const fingerprints = loadSourceFingerprints(body.name, source);
  const diskGroups = scanSourceGroups(body.name);
  const existingFiles = readSourceFiles(source);

  const inventory = buildEndpointInventory(spec, diskGroups, fingerprints, existingFiles);
  inventory.specChanged = computeSpecHash(spec) !== source.specHash;

  return inventory;
}

// ── Preview ──────────────────────────────────────────────────────────────────

interface ManagePreviewRequest {
  name: string;
  spec: ParsedSpec;
  toAdd: Record<string, string[]>;
  toRemove: Record<string, string[]>;
  configPath?: string;
}

interface ManagePreviewResponse {
  addResult?: AddResult;
  removeResult?: RemoveResult;
}

export function handleManagePreview(
  body: ManagePreviewRequest,
): ManagePreviewResponse | { error: string; status: number } {
  const config = loadRegistry(body.configPath);
  const source = getSource(config, body.name);
  if (!source) return { error: `Source "${body.name}" not found`, status: 404 };

  const existingFiles = readSourceFiles(source);
  const fingerprints = loadSourceFingerprints(body.name, source);

  let addResult: AddResult | undefined;
  let removeResult: RemoveResult | undefined;

  if (Object.keys(body.toAdd).length > 0) {
    addResult = previewAddEndpoints(
      body.spec,
      body.toAdd,
      { ...source.options, selectedEndpoints: body.toAdd },
      existingFiles,
    );
  }

  if (Object.keys(body.toRemove).length > 0) {
    removeResult = previewRemoveEndpoints(
      body.toRemove,
      source.options,
      existingFiles,
      fingerprints,
    );
  }

  return { addResult, removeResult };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function loadSourceFingerprints(name: string, source: RegistrySource): Record<string, string> {
  const cache = loadCache();
  const cached = getCachedFingerprints(cache, name);
  if (Object.keys(cached).length > 0) return cached;

  const existingFiles = readSourceFiles(source);
  return buildFallbackFingerprints(existingFiles, source.userModified);
}

function readSourceFiles(source: RegistrySource): Record<string, string> {
  const generated = [{ path: "dummy", content: "" }];
  const diskPaths = scanTsFiles(source, generated);
  return readFilesFromDisk(diskPaths);
}

function scanSourceGroups(name: string) {
  const scan = scanProject();
  const found = scan.sources.find((s) => s.name === name);
  return found?.groups ?? [];
}
