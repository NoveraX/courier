import type { RequestStates } from "./request-state";
import type { ServedTool, ToolSet } from "./served-tool";

/** How a server names itself in every result it answers with. */
export interface ServerInfo {
  readonly name: string;
  readonly version: string;
}

/** What a protocol server answers from: its tools, how they run, and the rules around them. */
export interface McpServerOptions {
  readonly info: ServerInfo;
  /** What the model is told about the tools as a whole. */
  readonly instructions?: string | undefined;
  /** The tools in force: the host rebuilds them when what they come from changes. */
  readonly tools: () => ToolSet;
  /** Whether a caller may see and call a tool; every tool, for every caller, when absent. */
  readonly allow?: ((tool: ServedTool, principal: unknown) => boolean) | undefined;
  /** Run a destructive tool without asking a person, leaving the decision to the client. */
  readonly allowDestructive: boolean;
  /** Seals the state a question for a person goes out with. */
  readonly states: RequestStates;
  /** The longest answer handed to a model, in characters. */
  readonly maxResultChars: number;
  /** What the server runs over, for the sentence that says how to lift a rule. */
  readonly transport: "stdio" | "http";
}
