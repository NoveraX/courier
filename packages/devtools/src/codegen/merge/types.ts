/**
 * Types for smart merge, fingerprinting, and spec diffing.
 */

import type { GenerateOptions } from "../generator/types";
import type { ParsedSpec } from "../parser/types";

// ── Fingerprint ─────────────────────────────────────────────────────────────

/** Classification of an endpoint's modification status */
export type EndpointStatus = "safe" | "modified" | "new" | "removed";

/** Per-endpoint fingerprint info stored in registry */
export interface EndpointFingerprint {
  /** SHA-256 hash of the generated code for this endpoint */
  hash: string;
  /** Whether user has modified this endpoint (detected on last check) */
  userModified: boolean;
}

/** Result of fingerprinting an existing file against stored hashes */
export interface FingerprintResult {
  /** Endpoint name → classification */
  endpoints: Record<string, EndpointStatus>;
  /** Endpoint name → extracted code block from existing file */
  existingCode: Record<string, string>;
}

// ── Spec Diff ───────────────────────────────────────────────────────────────

export type BreakingSeverity = "breaking" | "potentially-breaking" | "non-breaking";

export interface BreakingChange {
  severity: BreakingSeverity;
  category: string;
  message: string;
  endpoint?: string;
  schema?: string;
}

export interface DiffEndpoint {
  group: string;
  name: string;
  method: string;
  path: string;
  /** Details about what changed (for modified endpoints) */
  changes?: string[];
}

export interface SchemaDiff {
  name: string;
  type: "added" | "removed" | "modified";
  changes?: string[];
}

export interface SpecDiff {
  added: DiffEndpoint[];
  removed: DiffEndpoint[];
  modified: DiffEndpoint[];
  schemaChanges: SchemaDiff[];
  breakingChanges: BreakingChange[];
}

// ── Merge ───────────────────────────────────────────────────────────────────

export type MergeChangeType = "added" | "removed" | "updated" | "preserved";

export interface MergeChange {
  type: MergeChangeType;
  /** What was changed (e.g., "endpoint:getById", "import:zod", "schema:UserSchema") */
  target: string;
  detail: string;
}

export type MergeStatus = "safe" | "merged" | "conflict";

export interface MergeResult {
  /** Final merged file content */
  content: string;
  /** Overall merge status */
  status: MergeStatus;
  /** Detailed list of changes applied */
  changes: MergeChange[];
}

// ── Parse Existing ──────────────────────────────────────────────────────────

export interface ParsedImport {
  /** Full import line as-is */
  raw: string;
  /** Module specifier (e.g., "zod", "./schemas") */
  source: string;
  /** Named imports (e.g., ["defineGroup", "endpoint"]) */
  names: string[];
  /** Type-only imports (e.g., ["User", "Post"]) */
  typeNames: string[];
  /** Namespace import name if `import * as X` (e.g., "v") */
  namespaceImport?: string;
}

export interface ExistingEndpointInfo {
  name: string;
  /** Full code block including indentation and trailing comma */
  code: string;
  /** JSDoc comment above the endpoint (if any) */
  comment?: string;
}

export interface ExistingGroupInfo {
  groupName: string;
  prefix: string;
  imports: ParsedImport[];
  endpoints: ExistingEndpointInfo[];
  /** Code lines after the defineGroup block (user's helpers, constants) */
  trailingCode: string[];
}

// ── Registry ────────────────────────────────────────────────────────────────

export interface SpecSource {
  type: "url" | "file" | "raw";
  value: string;
}

export interface RegistrySource {
  specSource: SpecSource;
  specHash: string;
  specVersion: string;
  lastSynced: string;
  outputDir: string;
  options: GenerateOptions;
  endpoints: Record<string, EndpointFingerprint>;
  /** Cached parsed spec for offline re-generation */
  cachedSpec?: ParsedSpec;
}

export interface RegistryConfig {
  sources: Record<string, RegistrySource>;
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
  breakingChanges: BreakingChange[];
  /** Updated registry entry to persist */
  registryUpdate: RegistrySource;
}
