import type { AgentAccess, AgentClient } from "@noverax/courier";
import type { JSONSchema } from "@noverax/courier/openapi";

/** What came of a tool's call: its answer, or the sentence saying why there is none. */
export type ToolOutcome =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly message: string };

/** Who a tool runs for, and when to stop. */
export interface ToolCaller {
  readonly principal?: unknown;
  readonly client?: AgentClient | undefined;
  readonly signal: AbortSignal;
}

/** Why a call the server was asked for did not run: its arguments, or the person's answer. */
export interface Refusal {
  readonly kind: "validation" | "aborted";
  readonly message: string;
}

/**
 * A tool as a protocol server offers it, whatever runs it — an endpoint of
 * the application, or one of Studio's own views.
 */
export interface ServedTool {
  readonly name: string;
  /** A name for people, which a client shows in place of the tool's. */
  readonly title?: string | undefined;
  readonly description: string;
  readonly access: AgentAccess;
  /** What it takes, as JSON Schema: always an object. */
  readonly inputSchema: JSONSchema;
  /** What it answers with, as JSON Schema, when that is known. */
  readonly outputSchema?: JSONSchema | undefined;
  /** Whether making the same call twice does what making it once does. */
  readonly idempotent: boolean;
  /** The call a person is asked to confirm, as it goes out: `POST shop.orders.cancel`. */
  readonly action: string;
  /** What is wrong with a call's arguments, found before a person is asked about it. */
  readonly check?: ((args: Record<string, unknown>) => Promise<string | undefined>) | undefined;
  /**
   * The call as a person is asked to confirm it, for a tool whose arguments
   * decide what it does: `POST shop.orders.create with {"sku":"A1"}`. A tool
   * without it is confirmed as its `action` with the arguments it was given.
   */
  readonly confirming?: ((args: Record<string, unknown>) => Promise<string>) | undefined;
  /** Make the call. */
  readonly run: (args: Record<string, unknown>, caller: ToolCaller) => Promise<ToolOutcome>;
  /** Told of a call the server refused to make. */
  readonly refused?:
    | ((args: Record<string, unknown>, caller: ToolCaller, refusal: Refusal) => void)
    | undefined;
}

/** The tools a server offers, in a stable order, and each by its name. */
export interface ToolSet {
  readonly tools: readonly ServedTool[];
  readonly byName: ReadonlyMap<string, ServedTool>;
}

/**
 * A tool set from a list, keyed by name.
 *
 * @param tools - The tools, in the order they are listed
 * @returns The set
 * @example
 * ```ts
 * toolSet([requestsTool, requestTool]).byName.get("requests");
 * ```
 */
export function toolSet(tools: readonly ServedTool[]): ToolSet {
  return { tools, byName: new Map(tools.map((tool) => [tool.name, tool])) };
}
