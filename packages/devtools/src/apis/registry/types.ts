/**
 * Registry types — persisted config, source metadata, and update flow.
 */

import type { GenerateOptions } from "../generator/types";
import type { BreakingChange, MergeChange, MergeStatus, SpecDiff } from "../merge/types";

// ── Persisted Options ────────────────────────────────────────────────────────

/** Options stored in registry — transient fields (selectedEndpoints) are excluded */
export type PersistedGenerateOptions = Omit<GenerateOptions, "selectedEndpoints">;

/** How the spec was originally imported */
export type SpecImportType = "url" | "file" | "raw";

export interface RegistrySource {
  /** Remote URL (only for url imports, empty for file/raw) */
  specUrl: string;
  /** How the spec was imported — determines update check behavior */
  importType: SpecImportType;
  specHash: string;
  options: PersistedGenerateOptions;
  /** Endpoint names that were user-modified at last sync */
  userModified: string[];
}

export interface RegistryConfig {
  sources: Record<string, RegistrySource>;
  /** Directories to scan for hand-written APIs (default: ["src/api"]) */
  scanPaths?: string[];
  /** Glob patterns to ignore when scanning */
  scanIgnore?: string[];
}

// ── Update Flow ─────────────────────────────────────────────────────────────

export type RemovedEndpointAction = "remove" | "keep" | "deprecate";

export interface UpdateChoices {
  /** Per-endpoint decisions for removed endpoints: endpointKey → action */
  removedActions: Record<string, RemovedEndpointAction>;
  /** Endpoint keys to include from new spec (defaults to all) */
  includeNew: string[];
}

export interface UpdateFileResult {
  path: string;
  content: string;
  status: MergeStatus;
  changes: MergeChange[];
}

export interface UpdateResult {
  files: UpdateFileResult[];
  /** File paths on disk that will be removed (not in new spec) */
  deletedFiles: string[];
  breakingChanges: BreakingChange[];
  /** API-level structural diff (present when old digest is available) */
  specDiff?: SpecDiff;
}
