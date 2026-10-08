import type { AgentOptions } from "@noverax/courier";
import type { JSONSchema } from "@noverax/courier/openapi";
import type { StandardSchemaV1 } from "@standard-schema/spec";

/** Where an agent tool's call goes: the source, the group path and the endpoint's name. */
export interface ToolCallTarget {
  readonly source: string;
  readonly group: string | undefined;
  readonly method: string;
}

/**
 * One endpoint as an agent's tool: what the tool list says of it, and where
 * its call goes.
 */
export interface AgentTool {
  /** The tool's name: its call in the client, `orders_cancel`, or the name `.agent()` gave it. */
  readonly name: string;
  /** What the endpoint offered itself as. */
  readonly agent: AgentOptions;
  /** Where its call goes. */
  readonly target: ToolCallTarget;
  /** Its call in the client, for messages: `shop.orders.cancel`. */
  readonly path: string;
  /** The HTTP verb its call is sent with: `GET`, `DELETE`. */
  readonly verb: string;
  /** What its arguments are, as JSON Schema: always an object. */
  readonly inputSchema: JSONSchema;
  /** Whether the arguments carry variables that are not an object, as `{ value }`. */
  readonly wrapsValue: boolean;
  /** Whether the endpoint has a schema for its variables, so its arguments go as they came. */
  readonly takesVariables: boolean;
  /** The endpoint's variables schema: a destructive call's arguments are checked by it before a person is asked. */
  readonly variables: StandardSchemaV1 | undefined;
  /** What it answers with, as JSON Schema, when its response has a schema. */
  readonly outputSchema: JSONSchema | undefined;
  /** Why it is discouraged, when it is. */
  readonly deprecated: string | undefined;
}

/** A tool as the HTTP handler's `allow` sees it, to decide whether a caller may see and call it. */
export interface ToolSummary {
  readonly name: string;
  readonly access: AgentOptions["access"];
  /** Its call in the client: `shop.orders.cancel`. */
  readonly path: string;
  readonly description: string;
}
