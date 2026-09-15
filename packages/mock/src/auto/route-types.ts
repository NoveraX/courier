import type { Transport } from "@noverax/courier";
import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Type definitions for route analysis.
 *
 * Extracted from `route-analyzer.ts` so that types can be imported by helper
 * modules (probe, operation detection) without pulling in the analyzer logic.
 */

/** Analyzed route information from a source endpoint */
export interface RouteInfo {
  /** Group/collection name (e.g. "products", or derived from path for top-level endpoints) */
  group: string;
  /** Endpoint name (e.g. "getAll") */
  endpoint: string;
  /** HTTP method (e.g. "GET") */
  httpMethod: string;
  /** Relative path within group (e.g. "", ":id") */
  path: string;
  /** Full path including prefix (e.g. "/products/:id") */
  fullPath: string;
  /** Whether path contains an :id parameter */
  hasIdParam: boolean;
  /** Detected CRUD operation */
  operation: CrudOperation;
  /** Response schema if available */
  responseSchema?: StandardSchemaV1;
  /** Variables schema if available */
  variablesSchema?: StandardSchemaV1;
  /** Endpoint type (query/mutation) */
  type?: "query" | "mutation";
  /** Transport mode — "http" (default), "sse", or "ws" */
  transport?: Transport;
  /** True for WS bidirectional channel endpoints (have a `receive` schema) */
  isChannel?: boolean;
}

export type CrudOperation =
  | "list"
  | "get"
  | "create"
  | "update"
  | "replace"
  | "upsert"
  | "delete"
  | "deleteAll"
  | "custom";

/** Shape of a group within source.options.groups */
export interface SourceGroup {
  options?: { prefix?: string };
  [endpointName: string]: unknown;
}

/** Schema metadata extracted from an endpoint function */
export interface SchemaMetadata {
  response?: StandardSchemaV1;
  variables?: StandardSchemaV1;
  type?: "query" | "mutation";
  transport?: Transport;
  /** WS receive schema — present means bidirectional channel, absent means push-only */
  receive?: StandardSchemaV1;
}
