/**
 * Shared types for prefix route registration.
 *
 * Extracted from `prefix-routes.ts` so that helpers (`route-helpers`,
 * `prefix-static-routes`) can import the `MappedEndpoint`, `PrefixMapping`,
 * and `PrefixRouteConfig` shapes without pulling in the full Hono route
 * registration module. The original `prefix-routes.ts` re-exports these types
 * so that external imports keep working unchanged.
 */

import type { Transport } from "@noverax/nexus";
import type { Context as HonoContext } from "hono";

/** CRUD operation type for an endpoint */
export type EndpointOperation =
  | "list"
  | "get"
  | "create"
  | "update"
  | "replace"
  | "upsert"
  | "delete"
  | "deleteAll"
  | "custom";

/** Endpoint metadata within a prefix mapping */
export interface MappedEndpoint {
  name: string;
  operation: EndpointOperation;
  /** Relative path within the group (e.g. "", ":petId", "browse", "categories") */
  path: string;
  /** HTTP method for this endpoint (e.g. "GET", "POST") */
  httpMethod?: string;
  /** Transport mode — "http" (default), "sse", or "ws" */
  transport?: Transport;
  /** True for WS bidirectional channel endpoints (have a `receive` schema) */
  isChannel?: boolean;
}

/** Mapping from URL path prefix to group name + endpoint resolver */
export interface PrefixMapping {
  /** Group prefix (e.g. "/products") */
  prefix: string;
  /** Group name (e.g. "products") */
  group: string;
  /** Endpoint names in this group */
  methods: string[];
  /** Analyzed endpoints with operation + path info */
  endpoints?: MappedEndpoint[];
}

/** Route config needed by prefix routes — only the request handler entry point */
export interface PrefixRouteConfig {
  handleRequest: (
    c: HonoContext,
    group: string,
    method: string,
    variables: unknown,
  ) => Promise<Response>;
}
