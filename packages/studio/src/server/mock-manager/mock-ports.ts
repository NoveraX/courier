import type { MockEntry } from "../mock-registry";
import type { ServerState } from "./types";

/** The port a raw definition names, whether or not the rest of it can be read. */
export function declaredPortOf(definition: unknown): number | undefined {
  const port = (definition as { port?: unknown } | null)?.port;
  return typeof port === "number" && port > 0 ? port : undefined;
}

/** The ports the config's mock definitions name. */
export function declaredPorts(entries: readonly MockEntry[]): number[] {
  return entries.map((entry) => declaredPortOf(entry.definition)).filter((p) => p !== undefined);
}

export interface PortAssignerContext {
  servers: Map<string, ServerState>;
  basePort: number;
  /**
   * Every port the config declares, registered yet or not. Mocks are described
   * one at a time, so without them a mock with no port could be handed one a
   * mock registered after it declares.
   */
  reservedPorts: () => Iterable<number>;
}

/** The port a mock is tracked on, and whether the config named it. */
export type PortAssignment = Pick<ServerState, "configuredPort" | "portDeclared">;

/**
 * Build the rule for the port a mock is tracked on.
 *
 * A port the developer wrote down is a decision, not a preference, and is
 * held exactly. One Studio assigns comes from the base port, stays with the
 * key across restarts and config edits, so an app can be pointed at it —
 * until the config declares it for another mock, which then has the better
 * claim.
 *
 * @param ctx - The tracked mocks, the base port and the declared ports
 * @returns The port for a mock, given its definition's port and its current state
 */
export function createPortAssigner(
  ctx: PortAssignerContext,
): (declared: number | undefined, current?: ServerState) => PortAssignment {
  let nextPort = ctx.basePort;

  function allocateNextPort(): number {
    const usedPorts = new Set<number>(ctx.reservedPorts());
    for (const s of ctx.servers.values()) {
      usedPorts.add(s.configuredPort);
      if (s.actualPort) usedPorts.add(s.actualPort);
    }
    while (usedPorts.has(nextPort)) nextPort++;
    return nextPort++;
  }

  return (declared, current) => {
    if (declared !== undefined) return { configuredPort: declared, portDeclared: true };
    const kept = current && !current.portDeclared ? current.configuredPort : 0;
    if (kept > 0 && !new Set(ctx.reservedPorts()).has(kept)) {
      return { configuredPort: kept, portDeclared: false };
    }
    return { configuredPort: allocateNextPort(), portDeclared: false };
  };
}
