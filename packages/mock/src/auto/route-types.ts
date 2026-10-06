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
  /**
   * The prefix `path` is relative to (e.g. "/products"): the group's, joined
   * after every group's above it; for an endpoint without a group's prefix,
   * the collection its declared path starts with
   */
  prefix: string;
  /** Relative path within group (e.g. "", ":id") */
  path: string;
  /** Full path including prefix (e.g. "/products/:id") */
  fullPath: string;
  /**
   * The endpoint's group declares no prefix: it is served at the path it
   * declares alone, with no catch-all at its collection's prefix
   */
  exact?: true | undefined;
  /** Whether path contains an :id parameter */
  hasIdParam: boolean;
  /**
   * The parameter naming one record, for a path that names one
   * (`":petId"` → `"petId"`, `"by-email/:email"` → `"email"`)
   */
  idParam?: string | undefined;
  /** Detected CRUD operation */
  operation: CrudOperation;
  /**
   * Query values the declared path fixes, as a specification writes
   * `/responses?beta=true` to tell two operations at one path apart: the
   * endpoint answers only a request that carries them
   */
  fixedQuery?: Readonly<Record<string, string>> | undefined;
  /** Response schema if available */
  responseSchema?: StandardSchemaV1 | undefined;
  /** Variables schema if available */
  variablesSchema?: StandardSchemaV1 | undefined;
  /** Endpoint type (query/mutation) */
  type?: "query" | "mutation" | undefined;
  /** Transport mode — "http" (default), "sse", or "ws" */
  transport?: Transport | undefined;
  /** True for WS bidirectional channel endpoints (have a `receive` schema) */
  isChannel?: boolean | undefined;
  /** For a WS endpoint: what the proxy's WebSocket route checks a subscription against */
  channel?: ChannelShape | undefined;
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
