/**
 * Endpoint management types — drive the unified manage dialog. Cover
 * the endpoint inventory, preview, and apply flows.
 */

import type { FilePlanSummary } from "./types-file-plan";

export type ManageEndpointStatus = "active" | "available" | "custom" | "removed-from-spec";
export type ManageModificationStatus = "safe" | "modified";

export interface InventoryEndpoint {
  group: string;
  name: string;
  httpMethod: string;
  path: string;
  status: ManageEndpointStatus;
  modificationStatus?: ManageModificationStatus;
}

export interface InventoryGroup {
  name: string;
  prefix: string;
  endpoints: InventoryEndpoint[];
  isCustomGroup: boolean;
}

export interface EndpointInventory {
  groups: InventoryGroup[];
  specChanged: boolean;
  totalActive: number;
  totalAvailable: number;
  totalCustom: number;
}

export interface FileChange {
  path: string;
  content: string;
  action: "create" | "modify";
}

export interface ManageAddResult {
  files: FileChange[];
  sourceFileUpdate?: { path: string; content: string };
  indexFileUpdate?: { path: string; content: string };
  newFingerprints: Record<string, string>;
}

export interface ManageRemoveResult {
  modifiedFiles: Array<{ path: string; content: string }>;
  deletedFiles: string[];
  sourceFileUpdate?: { path: string; content: string };
  indexFileUpdate?: { path: string; content: string };
  removedFingerprints: string[];
  orphanedSchemas: string[];
  modifiedEndpointsWarning: string[];
}

export interface ManagePreviewResult {
  addResult?: ManageAddResult;
  removeResult?: ManageRemoveResult;
  /** What applying does to the import's files, file by file. */
  plan: FilePlanSummary;
}

export type ManageStep = "loading" | "reupload" | "inventory" | "preview" | "applying" | "done";
