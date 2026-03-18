/**
 * Catalog types — server-authoritative merged SourceMap.
 *
 * The catalog is the single source of truth for what endpoints exist
 * and how they look. It merges two layers:
 * - Scan layer (AST analysis) — structural truth
 * - Runtime layers (HMR) — enriched metadata (middleware, paths)
 */

export interface CatalogEndpoint {
  type: "query" | "mutation" | undefined;
  hasVariablesSchema: boolean;
  hasResponseSchema: boolean;
  path?: string;
  httpMethod?: string;
  middleware?: string[];
  /** Default variables stub from schema introspection */
  variablesStub?: Record<string, unknown>;
  origin: "scan" | "runtime" | "both";
}

export interface CatalogGroup {
  prefix: string;
  endpoints: Record<string, CatalogEndpoint>;
}

export interface CatalogEntry {
  baseURL: string;
  groups: Record<string, CatalogGroup>;
}

export type Catalog = Record<string, CatalogEntry>;

export interface CatalogSnapshot {
  catalog: Catalog;
  timestamp: number;
  meta: CatalogMeta;
}

export interface CatalogMeta {
  scanTimestamp: number | null;
  runtimeSessions: string[];
  totalEndpoints: number;
}

/**
 * Name mapping: runtime key → canonical (scanner) key.
 * Sent to connected apps so they update their local registry
 * and emit events with canonical names.
 *
 * Example: { "jsonplaceholder": "jsonPlaceholder" }
 */
export type NameMapping = Record<string, string>;

export interface MergeResult {
  catalog: Catalog;
  /** Runtime source names that differ from canonical names */
  nameMapping: NameMapping;
}
