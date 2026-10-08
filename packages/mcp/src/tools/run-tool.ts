import type { AgentCall, AgentClient } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { executeRequest } from "@noverax/courier/internal";

import type { AgentTool } from "./agent-tool";
import { failureMessage } from "./failure-message";

/** What came of a tool's call: the endpoint's answer, or the sentence saying why there is none. */
export type ToolOutcome =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly message: string };

/** What a tool's call runs against, and on whose behalf. */
export interface ToolRun {
  readonly sources: Sources;
  /** Who the server let in: what the HTTP handler's `authorize` returned. */
  readonly principal?: unknown;
  /** The client the agent works through, as it named itself. */
  readonly client?: AgentClient | undefined;
  /** Fires when the client stops waiting: the call is then dropped, and nothing answers it. */
  readonly signal: AbortSignal;
  /** How long a call may take when its endpoint names no timeout, in milliseconds. */
  readonly timeoutMs: number;
}

/**
 * Call a tool's endpoint the way the application calls it: through its
 * source's and its own middleware, its schemas and Studio, with `ctx.agent`
 * saying which agent asked. The call carries no request being served, so
 * no browser's session reaches the API through an agent.
 *
 * @param tool - The tool
 * @param args - Its arguments, as the client sent them
 * @param run - What the call runs against, and on whose behalf
 * @returns The answer, or why there is none
 * @throws What the call failed with, when the client stopped waiting for it
 * @example
 * ```ts
 * const outcome = await runTool(tool, { id: "7" }, { sources, signal, timeoutMs: 60_000 });
 * ```
 */
export async function runTool(
  tool: AgentTool,
  args: Record<string, unknown>,
  run: ToolRun,
): Promise<ToolOutcome> {
  const agent: AgentCall = {
    tool: tool.name,
    access: tool.agent.access,
    ...(run.principal !== undefined && { principal: run.principal }),
    ...(run.client !== undefined && { client: run.client }),
  };
  try {
    const data = await executeRequest(
      run.sources,
      { ...tool.target, variables: variablesOf(tool, args), options: { signal: run.signal } },
      { agent, defaultTimeout: run.timeoutMs },
    );
    return { ok: true, data };
  } catch (error) {
    if (run.signal.aborted) throw error;
    return { ok: false, message: failureMessage(error) };
  }
}

/* An endpoint that declares no variables takes none; one whose arguments wrap them takes `value`. */
function variablesOf(tool: AgentTool, args: Record<string, unknown>): unknown {
  if (tool.wrapsValue) return args.value;
  return tool.takesVariables || Object.keys(args).length > 0 ? args : undefined;
}
