/**
 * The shapes prefix route registration works with, in a module of their own
 * so a helper can name them without the Hono route registration module.
 */

import type { Transport } from "@noverax/courier";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Context as HonoContext } from "hono";
import type { BodyRefusal, RequestBody } from "./read-request-body";

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
  httpMethod?: string | undefined;
  /** Query values the declared path fixes; the endpoint answers only a request that carries them */
  fixedQuery?: Readonly<Record<string, string>> | undefined;
  /** Transport mode — "http" (default), "sse", or "ws" */
  transport?: Transport | undefined;
  /** True for WS bidirectional channel endpoints (have a `receive` schema) */
  isChannel?: boolean | undefined;
  /** For a WS endpoint: what the proxy's WebSocket route checks a subscription against */
  channel?: ChannelShape | undefined;
}

/** What the proxy's WebSocket route checks a subscription to a channel against */
export interface ChannelShape {
  /** The subscription's variables */
  variables?: StandardSchemaV1 | undefined;
  /** Each message the caller sends */
  receive?: StandardSchemaV1 | undefined;
  /** Whether the caller may send on it: it declared what it receives */
  acceptsMessages: boolean;
  /** Reads the key the channel's subscribers share a topic by, from `.topic()` */
  topicKey?: ((variables: unknown) => unknown) | undefined;
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
  /**
   * Its group declares no prefix: each endpoint is served at the path it
   * declares alone, and no catch-all claims the prefix
   */
  exact?: true | undefined;
}

/** Route config needed by prefix routes — only the request handler entry point */
export interface PrefixRouteConfig {
  handleRequest: (
    c: HonoContext,
    group: string,
    method: string,
    variables: unknown,
  ) => Promise<Response>;
  /** Refuse a request whose body was not taken, logged as any request is */
  refuse: (c: HonoContext, group: string, method: string, refusal: BodyRefusal) => Response;
  /** Read the body of a call to `group.method`, under the conditions its route is answered with */
  readBody: (c: HonoContext, group: string, method: string) => Promise<RequestBody>;
}
