/**
 * Types for endpoint management — inventory, add, and remove operations.
 */

// ── Disk inventory ──────────────────────────────────────────────────────────

/**
 * Per-group endpoint listing derived from generated files on disk.
 *
 * The inventory needs only the endpoint names and the group's identity: the
 * spec is the canonical source of each active endpoint's `httpMethod` and
 * `path`.
 */
export interface DiskGroupListing {
  name: string;
  prefix: string;
  endpoints: string[];
  /** The file declaring the group's endpoints, project-relative. */
  file: string;
}

// ── Endpoint Classification ──────────────────────────────────────────────────

/** Where an endpoint lives relative to spec and disk */
export type EndpointStatus = "active" | "available" | "custom" | "removed-from-spec";

/** Whether an active endpoint has been user-modified */
export type ModificationStatus = "safe" | "modified";

export interface InventoryEndpoint {
  group: string;
  name: string;
  httpMethod: string;
  path: string;
  status: EndpointStatus;
  /** Only set for "active" endpoints — safe means fingerprint matches */
  modificationStatus?: ModificationStatus | undefined;
}

export interface InventoryGroup {
  name: string;
  prefix: string;
  endpoints: InventoryEndpoint[];
  /** True if the entire group has no spec match and no fingerprints */
  isCustomGroup: boolean;
}

export interface EndpointInventory {
  groups: InventoryGroup[];
  /** True if spec hash differs from stored hash */
  specChanged: boolean;
  totalActive: number;
  totalAvailable: number;
  totalCustom: number;
}

// ── Add / Remove Results ─────────────────────────────────────────────────────

export interface FileChange {
  path: string;
  content: string;
  action: "create" | "modify";
  /** The fingerprint of each endpoint in the file as generated, by endpoint name. */
  generatedEndpoints: Record<string, string>;
}

export interface AddResult {
  files: FileChange[];
  sourceFileUpdate?: { path: string; content: string } | undefined;
  newFingerprints: Record<string, string>;
}

export interface RemoveResult {
  modifiedFiles: Array<{ path: string; content: string }>;
  deletedFiles: string[];
  sourceFileUpdate?: { path: string; content: string };
  /** The barrel without the re-exports of the groups removed whole. */
  indexFileUpdate?: { path: string; content: string };
  removedFingerprints: string[];
  orphanedSchemas: string[];
  /** Endpoints with user modifications that will be deleted */
  modifiedEndpointsWarning: string[];
}
