import type { AgentClient } from "@noverax/courier";

import type { AgentTool } from "../tools/agent-tool";
import type { Catalog } from "../tools/catalog";
import type { ToolOutcome } from "../tools/run-tool";
import type { RequestStates } from "./request-state";

/** How a server names itself in every result it answers with. */
export interface ServerInfo {
  readonly name: string;
  readonly version: string;
}

/** Who a tool runs for, and when to stop. */
export interface ToolCaller {
  readonly principal?: unknown;
  readonly client?: AgentClient | undefined;
  readonly signal: AbortSignal;
}

/** What a protocol server answers from: its tools, how they run, and the rules around them. */
export interface McpServerOptions {
  readonly info: ServerInfo;
  /** What the model is told about the tools as a whole. */
  readonly instructions?: string | undefined;
  /** The tools in force: the host rebuilds them when its sources change. */
  readonly catalog: () => Catalog;
  /** Whether a caller may see and call a tool; every tool, for every caller, when absent. */
  readonly allow?: ((tool: AgentTool, principal: unknown) => boolean) | undefined;
  /** Run a tool's call. */
  readonly run: (
    tool: AgentTool,
    args: Record<string, unknown>,
    caller: ToolCaller,
  ) => Promise<ToolOutcome>;
  /** Run a destructive tool without asking a person, leaving the decision to the client. */
  readonly allowDestructive: boolean;
  /** Seals the state a question for a person goes out with. */
  readonly states: RequestStates;
  /** The longest answer handed to a model, in characters. */
  readonly maxResultChars: number;
  /** What the server runs over, for the sentence that says how to lift a rule. */
  readonly transport: "stdio" | "http";
}
