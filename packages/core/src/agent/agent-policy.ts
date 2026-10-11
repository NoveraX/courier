import type { AgentAccess } from "./types";

/**
 * Which endpoints a project offers to AI agents without `.agent()`.
 *
 * - `marked` — none: only an endpoint that names `.agent()` is offered.
 * - `reads` — every read as well, each as a tool that changes nothing.
 * - `all` — every endpoint, each with the access its verb implies: a read
 *   for a query, `destructive` for DELETE, `write` for the rest.
 */
export type AgentOffer = "marked" | "reads" | "all";

/**
 * What a project offers to AI agents, set once in `courier.config.ts` and
 * read by the MCP server, by Studio and by `courier-studio diff`.
 *
 * An endpoint is decided in this order, the first rule that speaks
 * deciding it: a `deny` pattern it matches keeps it out; `.agent(false)`
 * keeps it out; access beyond `access` keeps it out; `.agent()` offers it;
 * an `allow` pattern offers it; `offer` offers it; nothing else does.
 *
 * Patterns name an endpoint by its call in the client under its source —
 * `shop.orders.cancel` — where `*` stands for any part of one name and
 * `**` for any number of names: `shop.orders.*`, `billing.**`.
 *
 * @example
 * ```ts
 * // courier.config.ts
 * export default defineConfig({
 *   sources: { shop, billing },
 *   agents: {
 *     offer: "reads",
 *     allow: ["shop.orders.cancel"],
 *     deny: ["billing.**"],
 *     confirm: "write",
 *   },
 * });
 * ```
 */
export interface AgentPolicy {
  /** Which endpoints are offered without `.agent()`: `marked` (default), `reads` or `all`. */
  readonly offer?: AgentOffer | undefined;
  /** Endpoints to offer although `offer` leaves them out, by pattern. */
  readonly allow?: readonly string[] | undefined;
  /** Endpoints no agent sees, whatever else offers them, by pattern. */
  readonly deny?: readonly string[] | undefined;
  /**
   * The most a tool may do: `read`, `write` or `destructive` (default).
   * An endpoint that does more is offered to no agent, marked or not.
   */
  readonly access?: AgentAccess | undefined;
  /**
   * From which access a person confirms each call: `destructive` (default)
   * for what cannot be undone, or `write` for every call that changes
   * something.
   */
  readonly confirm?: Exclude<AgentAccess, "read"> | undefined;
}
