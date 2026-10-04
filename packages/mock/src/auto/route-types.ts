import type { Transport } from "@noverax/courier";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ChannelShape } from "../server/prefix-route-types";

/**
 * The shapes route analysis works with, in a module of their own so its
 * helpers — probing, operation detection — can name them without the
 * analyzer.
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
  /**
   * The parameter naming one record, for a path that names one
   * (`":petId"` → `"petId"`, `"by-email/:email"` → `"email"`)
   */
  idParam?: string;
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
  /** For a WS endpoint: what the proxy's WebSocket route checks a subscription against */
  channel?: ChannelShape;
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

/** Schema metadata extracted from an endpoint function */
export interface SchemaMetadata {
  response?: StandardSchemaV1;
  variables?: StandardSchemaV1;
  type?: "query" | "mutation";
  transport?: Transport;
  /** WS receive schema — present means bidirectional channel, absent means push-only */
  receive?: StandardSchemaV1;
  /** Set when the channel declares what it receives, with or without a schema */
  bidirectional?: true;
}
