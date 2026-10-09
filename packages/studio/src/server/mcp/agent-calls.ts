import type { RequestAgent } from "@noverax/courier-studio-core";

/**
 * The requests Studio runs for an agent — a replay an agent asked for —
 * which the records of those requests name the agent on, as the records
 * of an agent's calls through the app's own MCP server do.
 */
export interface AgentCalls {
  /** Name the agent on the request Studio is about to run for it. */
  expect(requestId: string, agent: RequestAgent): void;
  /** The request's run settled; its start has been seen. */
  forget(requestId: string): void;
  /** The event, naming the agent when it starts a request Studio runs for one. */
  stamp(event: Record<string, unknown>): Record<string, unknown>;
}

/**
 * The requests Studio runs for agents, kept until each run settles.
 *
 * @returns An empty set of them
 * @example
 * ```ts
 * const agentCalls = createAgentCalls();
 * agentCalls.expect("pg_7", { tool: "replay", access: "read", client: "code-editor 2.1.0" });
 * ```
 */
export function createAgentCalls(): AgentCalls {
  const expected = new Map<string, RequestAgent>();
  return {
    expect: (requestId, agent) => {
      expected.set(requestId, agent);
    },
    forget: (requestId) => {
      expected.delete(requestId);
    },
    stamp: (event) => {
      if (event.type !== "request:start" || typeof event.id !== "string") return event;
      const agent = expected.get(event.id);
      return agent === undefined ? event : { ...event, agent };
    },
  };
}
