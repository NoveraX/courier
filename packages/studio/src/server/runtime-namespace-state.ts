/**
 * Module-level state for the Studio `/runtime` namespace, pinned to globalThis
 * so Turbopack / webpack module duplication during HMR does not reset the Maps
 * (which would orphan a connected runtime against a fresh `BindingTable`).
 *
 * The runtime registry stores one entry per attached runtime — the live Socket
 * plus the latest `(transports, sourceNames)` pair the runtime announced — so
 * the disconnect handler in `runtime-namespace.ts` can detach the runtime from
 * `BindingTable` symmetrically without re-reading the wire payload. When the
 * attached runtimes began to be lives here too: the `/runtime` namespace is
 * the single owner of all studio-server runtime state.
 */

import type { Socket } from "socket.io";
import type { BindingTransport } from "./catalog/binding-table";
import { isTrustedRuntime } from "./runtime-trust";

const RUNTIME_REGISTRY_KEY = Symbol.for("courier.studio.runtime-registry");
const ACTIVE_PERIOD_KEY = Symbol.for("courier.studio.runtimes-active-period");

/** Snapshot of the latest `runtime:announce` payload for a connected runtime */
export interface RuntimeRegistryEntry {
  runtimeId: string;
  kind: "browser" | "server";
  socket: Socket;
  transports: ReadonlyArray<BindingTransport>;
  sourceNames: ReadonlyArray<string>;
  /** Latest `listenOrigin` from `runtime:announce`, if the adapter supplied one */
  listenOrigin?: string;
  /** Latest `framework` brand from `runtime:announce`, if the adapter supplied one */
  framework?: string;
}

const g = globalThis as Record<symbol, unknown>;

if (!g[RUNTIME_REGISTRY_KEY]) {
  g[RUNTIME_REGISTRY_KEY] = new Map<string, RuntimeRegistryEntry>();
}
if (!g[ACTIVE_PERIOD_KEY]) g[ACTIVE_PERIOD_KEY] = { since: undefined };

/** Map of runtimeId → registry entry. Owned by the `/runtime` namespace. */
export const runtimeRegistry = g[RUNTIME_REGISTRY_KEY] as Map<string, RuntimeRegistryEntry>;

/* When the first runtime of the runtimes attached now arrived; unset while none is. */
const activePeriod = g[ACTIVE_PERIOD_KEY] as { since: number | undefined };

/**
 * When the runtimes attached now began to be: the first one's arrival, kept
 * while any of them stays, so the session's running time survives a runtime
 * that leaves and comes back while another stays — and a page that reloads.
 *
 * @returns The time, or `undefined` while no runtime is attached
 */
export function runtimesActiveSince(): number | undefined {
  return activePeriod.since;
}

/**
 * Every live socket per runtime id, newest last. Processes can share an id —
 * two services left on the default `"server"`, cluster workers, two instances
 * of one app — and the registry entry speaks through the newest of them.
 */
const runtimeSockets = new Map<string, Socket[]>();

/** Insert or replace the entry for a runtime that just sent `runtime:hello`. */
export function registerRuntime(entry: RuntimeRegistryEntry): "claimed" | "duplicate" {
  const sockets = runtimeSockets.get(entry.runtimeId) ?? [];
  runtimeSockets.set(entry.runtimeId, [...sockets.filter((s) => s !== entry.socket), entry.socket]);
  /* A live runtime already serving sources under the id keeps its calls: a
     second process claiming the id — a copy started by mistake, or one
     posing as it — is held back, and Studio names the clash. One with the
     project's token takes the id from one without it, which could otherwise
     hold it first and keep the application's own runtime out. */
  const current = runtimeRegistry.get(entry.runtimeId);
  if (
    current &&
    current.socket !== entry.socket &&
    current.socket.connected &&
    current.sourceNames.length > 0 &&
    !(isTrustedRuntime(entry.socket) && !isTrustedRuntime(current.socket))
  ) {
    return "duplicate";
  }
  if (runtimeRegistry.size === 0) activePeriod.since = Date.now();
  runtimeRegistry.set(entry.runtimeId, entry);
  return "claimed";
}

/**
 * Release one socket of a runtime id; answers whether it was the last. While
 * others remain, calls move to the oldest of them and the runtime stays, so
 * the first of two processes sharing an id to disconnect does not remove the
 * entry and the bindings of the one still running.
 */
export function releaseRuntimeSocket(runtimeId: string, socket: Socket): "last" | "remaining" {
  const remaining = (runtimeSockets.get(runtimeId) ?? []).filter((s) => s !== socket);
  const next = remaining[0];
  if (!next) {
    runtimeSockets.delete(runtimeId);
    return "last";
  }
  runtimeSockets.set(runtimeId, remaining);
  const entry = runtimeRegistry.get(runtimeId);
  if (entry?.socket === socket) runtimeRegistry.set(runtimeId, { ...entry, socket: next });
  return "remaining";
}

/** Update the `(transports, sourceNames)` claim of an already-registered runtime. */
export function updateRuntimeClaim(
  runtimeId: string,
  transports: ReadonlyArray<BindingTransport>,
  sourceNames: ReadonlyArray<string>,
  extras: { listenOrigin?: string; framework?: string } = {},
): RuntimeRegistryEntry | undefined {
  const existing = runtimeRegistry.get(runtimeId);
  if (!existing) return undefined;
  const next: RuntimeRegistryEntry = {
    ...existing,
    transports,
    sourceNames,
    listenOrigin: extras.listenOrigin ?? existing.listenOrigin,
    framework: extras.framework ?? existing.framework,
  };
  runtimeRegistry.set(runtimeId, next);
  return next;
}

/** Drop a runtime from the registry. Returns the removed entry, if any. */
export function unregisterRuntime(runtimeId: string): RuntimeRegistryEntry | undefined {
  const existing = runtimeRegistry.get(runtimeId);
  if (!existing) return undefined;
  runtimeRegistry.delete(runtimeId);
  if (runtimeRegistry.size === 0) activePeriod.since = undefined;
  return existing;
}

/** Look up a runtime by id — used by the playground router. */
export function getRuntimeEntry(runtimeId: string): RuntimeRegistryEntry | undefined {
  return runtimeRegistry.get(runtimeId);
}

/**
 * Drop every entry from the globalThis-pinned studio-server Maps.
 *
 * Intended for full server shutdown and test isolation. Per-runtime cleanup
 * lives in the `/runtime` namespace disconnect handler. This function is the symmetric
 * counterpart for the shutdown path, mirroring `playgroundRouter.dispose()`
 * (playground router).
 *
 * MUST NOT be called from per-socket disconnect handlers.
 */
export function clearStudioServerState(): void {
  runtimeRegistry.clear();
  runtimeSockets.clear();
  activePeriod.since = undefined;
}
