/**
 * Catalog types — server-authoritative merged SourceMap.
 *
 * The catalog is the single source of truth for what endpoints exist
 * and how they look. It merges two layers:
 * - Scan layer (AST analysis) — structural truth
 * - Runtime layers (HMR) — enriched metadata (middleware, paths)
 */

import type { ProxyPath } from "@noverax/nexus";

export interface CatalogEndpoint {
  type: "query" | "mutation" | undefined;
  hasVariablesSchema: boolean;
  hasResponseSchema: boolean;
  path?: string;
  httpMethod?: string;
  middleware?: string[];
  /** Default variables stub from schema introspection */
  variablesStub?: Record<string, unknown>;
  /** Transport mode for realtime endpoints */
  transport?: "sse" | "ws";
  /** Whether the WS endpoint has a receive schema (bidirectional channel) */
  hasReceiveSchema?: boolean;
  origin: "scan" | "runtime" | "both";
}

export interface CatalogGroup {
  prefix: string;
  endpoints: Record<string, CatalogEndpoint>;
}

export interface CatalogEntry {
  baseURL: string;
  /**
   * The user-app's own HTTP origin (e.g. `http://localhost:3000`) declared
   * via `instrumentServer({ appOrigin })`. Lets the Playground UI resolve
   * relative `proxyPath` values into full clickable URLs (e.g. `/api/sse`
   * → `http://localhost:3000/api/sse`). Runtime-only — the AST scanner
   * cannot detect this field, and it has no meaningful value in the
   * browser-only `connectStudio` flow.
   */
  appOrigin?: string;
  /**
   * Per-transport proxy endpoint configuration carried from the source's
   * `defineApi({ proxyPath })`. Used by the Playground to display the
   * configured proxy URL as read-only metadata. Omitted when the source
   * has no `proxyPath` configured. Only the runtime layer carries this —
   * the AST scanner cannot statically resolve `proxyPath` values.
   */
  proxyPath?: ProxyPath;
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
