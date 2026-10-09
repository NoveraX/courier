/**
 * What a call does to what it addresses, as an agent is told.
 *
 * - `read` changes nothing: it may be called as often as the agent likes.
 * - `write` changes what it addresses, and can be undone or done again.
 * - `destructive` removes or overwrites what cannot be restored, so a person
 *   confirms each call.
 */
export type AgentAccess = "read" | "write" | "destructive";

/**
 * How an endpoint is offered to AI agents, as a tool of an MCP server.
 *
 * Only an endpoint that names `.agent()` is offered; every other one stays
 * out of every agent's reach.
 *
 * @example
 * ```ts
 * endpoint
 *   .get("orders/:id")
 *   .response(Order)
 *   .agent({ description: "One order by its id, with its items and status", access: "read" });
 * ```
 */
export interface AgentOptions<TAccess extends AgentAccess = AgentAccess> {
  /**
   * What the tool does, written for the model that decides when to call it:
   * what it needs, what it answers with, and what it changes.
   */
  readonly description: string;
  /** What a call does to what it addresses: `read`, `write` or `destructive`. */
  readonly access: TAccess;
  /**
   * The tool's name, when its call in the client is not the name to give it:
   * letters, digits, `_` and `-`, at most 64 of them.
   */
  readonly name?: string | undefined;
  /** A name for people, which a client shows in place of the tool's. */
  readonly title?: string | undefined;
  /**
   * How often a caller may call the tool. A call beyond it is refused at
   * once — before a person is asked to confirm it — with when the caller may
   * call again, and shows in Studio as refused. The model is told the limit
   * with the tool. Counted per caller the MCP server tells apart: per
   * `limitPer` over HTTP, one count for the one client over stdio.
   */
  readonly limit?: AgentLimit | undefined;
}

/**
 * At most `maxCalls` calls in any `window` milliseconds.
 *
 * @example
 * ```ts
 * endpoint
 *   .post("orders/:id/refund")
 *   .agent({
 *     description: "Refund an order in full",
 *     access: "destructive",
 *     limit: { maxCalls: 3, window: 60_000 },
 *   });
 * ```
 */
export interface AgentLimit {
  /** How many calls a window takes: a whole number, at least 1 */
  readonly maxCalls: number;
  /** How long a window is, in milliseconds: a whole number, at least 1000 */
  readonly window: number;
}

/** The client an agent works through, as it named itself — for display, never for a decision. */
export interface AgentClient {
  readonly name: string;
  readonly version?: string | undefined;
}

/**
 * The agent a call comes from, as its middleware sees it in `ctx.agent`.
 *
 * Absent on every call an application makes itself, so a middleware tells an
 * agent's calls apart — and refuses, limits or records them — by its presence.
 *
 * @example
 * ```ts
 * defineMiddleware("agents", "wrap", async (ctx, next) => {
 *   if (ctx.agent?.access === "destructive" && !isAdmin(ctx.agent.principal)) {
 *     return { status: 403, data: { message: "Not for this agent" }, headers: new Headers() };
 *   }
 *   return next();
 * });
 * ```
 */
export interface AgentCall {
  /** The tool the agent called. */
  readonly tool: string;
  /** What the endpoint declared a call does. */
  readonly access: AgentAccess;
  /**
   * Who the server let in: what the HTTP handler's `authorize` returned.
   * Absent over stdio, where the agent runs as the person who started it.
   */
  readonly principal?: unknown;
  /** The client the agent works through, as it named itself. */
  readonly client?: AgentClient | undefined;
}
