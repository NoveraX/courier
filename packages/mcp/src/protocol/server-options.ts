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
  /**
   * Tells the server when its tools may have changed — the project's config
   * loaded again after a save — so that a client that asked to hear of it
   * is told, once the list it sees is really different. Returns how to stop
   * telling. Absent, the tools stay as they are for the server's life.
   */
  readonly onToolsChanged?: ((told: () => void) => () => void) | undefined;
  /** Whether a caller may see and call a tool; every tool, for every caller, when absent. */
  readonly allow?: ((tool: ServedTool, principal: unknown) => boolean) | undefined;
  /**
   * Names the caller a tool's limit is counted for, from what `authorize`
   * returned: one key per agent, user or API key. Every caller shares one
   * count when absent.
   */
  readonly limitPer?: ((principal: unknown) => string) | undefined;
  /** Run a destructive tool without asking a person, leaving the decision to the client. */
  readonly allowDestructive: boolean;
  /** Seals the state a question for a person goes out with. */
  readonly states: RequestStates;
  /** The longest answer handed to a model, in characters. */
  readonly maxResultChars: number;
  /** What the server runs over, for the sentence that says how to lift a rule. */
  readonly transport: "stdio" | "http";
  /**
   * What a refusal tells a client that cannot ask a person to do instead,
   * when the server's operator does not lift the rule: how a person still
   * gets the call made. By default, how the operator lifts it.
   */
  readonly unasked?: string | undefined;
}
