/**
 * Types for smart merge, fingerprinting, and spec diffing.
 */

import type { ParsedSpec } from "../parser/types";

// ── Fingerprint ─────────────────────────────────────────────────────────────

/** Classification of an endpoint's modification status */
export type EndpointStatus = "safe" | "modified" | "new" | "removed";

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
  comment?: string | undefined;
}

export interface ExistingGroupInfo {
  groupName: string;
  prefix: string;
  /**
   * The declaration down to and including the line opening `endpoints`.
   *
   * Kept verbatim rather than rebuilt, so a flat source keeps its baseURL and
   * everything else it configures, and a group keeps its prefix.
   */
  header: string[];
  /** The lines closing the declaration, after the endpoints. */
  footer: string[];
  /**
   * How this file names the base its endpoints are built from.
   *
   * `endpoint` as generated, but a person may have renamed the destructuring
   * or kept the base whole — `ep`, or `api.endpoint`. Endpoints are recognised
   * and rewritten in whichever name the file already uses.
   */
  baseName: string;
  /** How the file names its stream builder; `null` when it names none. */
  streamBaseName: string | null;
  imports: ParsedImport[];
  endpoints: ExistingEndpointInfo[];
  /** Code lines between the imports and the defineGroup block (builder heads) */
  preamble: string[];
  /** Code lines after the defineGroup block (user's helpers, constants) */
  trailingCode: string[];
}

// ── Spec Digest (lightweight spec snapshot for diffing) ─────────────────────

/** Compact endpoint snapshot for diffing (fullPath removed — reconstructable from group) */
export interface DigestEndpoint {
  name: string;
  httpMethod: string;
  path: string;
  secured: boolean;
  parameters: { in: string; name: string }[];
  /** Schema ref name or primitive type, e.g. "UserDto" or "object" */
  responseRef: string | null;
  /** Schema ref name or primitive type, e.g. "CreateUserDto" or "object" */
  requestRef: string | null;
}

/** Minimal group — structurally compatible with ParsedGroup for diffing */
export interface DigestGroup {
  name: string;
  endpoints: DigestEndpoint[];
}

/** Compact schema snapshot for diffing (required[] removed — redundant with per-property flag) */
export interface DigestSchema {
  name: string;
  type: string;
  properties?: Record<string, { type: string; required: boolean }>;
}

/** Lightweight spec snapshot — only the structure needed for diff/breaking detection */
export interface SpecDigest {
  /** Discriminant for type-safe ParsedSpec vs SpecDigest detection */
  _kind: "digest";
  groups: DigestGroup[];
  schemas: Record<string, DigestSchema>;
}

/** Either a full ParsedSpec or a lightweight SpecDigest — accepted by diffSpecs */
export type DiffableSpec = ParsedSpec | SpecDigest;
