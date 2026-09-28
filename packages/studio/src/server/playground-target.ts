import type { Socket } from "socket.io";

import { BindingConflictError, type BindingTable } from "./catalog/binding-table";
import { getRuntimeEntry } from "./runtime-namespace-state";
import { isTrustedRuntime } from "./runtime-trust";

/** The runtime socket to send a Playground call to, or why there is none. */
export type PlaygroundTarget = { runtimeId: string; socket: Socket } | { refusal: string };

/**
 * Pick the runtime that serves a Playground call: the one runtime that claims
 * its source on its transport and presented this project's Studio token. A
 * runtime without the token may be any process on the machine, and a call
 * hands it the headers typed into it, so it is never sent one; nor does its
 * claim stand in the way of the runtime that has the token.
 *
 * @param bindingTable - Which runtimes claim which sources
 * @param payload - The call's source and transport
 * @returns The runtime and its socket, or why no runtime can take the call
 *
 * @example
 * ```ts
 * const target = playgroundTarget(bindingTable, { source: "api", transport: "http" });
 * if ("refusal" in target) emitErrorToUi(uiSocket.id, rid, target.refusal);
 * ```
 */
export function playgroundTarget(
  bindingTable: BindingTable,
  payload: { source: string; transport: "http" | "sse" | "ws" },
): PlaygroundTarget {
  const { source, transport } = payload;
  const claimants = bindingTable.claimantsOf(source, transport);
  if (claimants.length === 0) {
    return { refusal: `No runtime hosts ${source} on ${transport.toUpperCase()}` };
  }
  const present = claimants.flatMap((id) => {
    const entry = getRuntimeEntry(id);
    return entry ? [{ id, socket: entry.socket }] : [];
  });
  if (present.length === 0) return { refusal: `Runtime ${claimants[0]} is not connected` };
  const trusted = present.filter((claimant) => isTrustedRuntime(claimant.socket));
  const [chosen, ...others] = trusted;
  if (!chosen) {
    const ids = present.map((claimant) => claimant.id);
    return { refusal: untrusted(ids, source) };
  }
  if (others.length > 0) {
    const ids = trusted.map((claimant) => claimant.id);
    return { refusal: new BindingConflictError(source, transport, ids).message };
  }
  if (!chosen.socket.connected) return { refusal: `Runtime ${chosen.id} is not reachable` };
  return { runtimeId: chosen.id, socket: chosen.socket };
}

function untrusted(runtimeIds: readonly string[], source: string): string {
  return (
    `${runtimeIds.join(", ")} hosts ${source} but did not present this project's Studio ` +
    "token, so Studio sends it no Playground calls. A server runtime reads it from " +
    ".courier/studio-token beside courier.config."
  );
}
