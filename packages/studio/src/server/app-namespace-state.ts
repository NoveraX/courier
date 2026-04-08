/**
 * Module-level state for the Studio app namespace, pinned to globalThis so
 * Turbopack / webpack module duplication during HMR does not reset the Maps
 * (which would let a reconnecting app reuse a previous session version or
 * lose track of mock-server ownership).
 */

const MOCK_SERVERS_KEY = Symbol.for("nexus.studio.mock-servers");
const SOCKET_MOCK_SERVERS_KEY = Symbol.for("nexus.studio.socket-mock-servers");
const SESSION_VERSION_REGISTRY_KEY = Symbol.for("nexus.studio.session-version-registry");

const g = globalThis as Record<symbol, unknown>;

if (!g[MOCK_SERVERS_KEY]) g[MOCK_SERVERS_KEY] = new Map<string, Record<string, unknown>>();
if (!g[SOCKET_MOCK_SERVERS_KEY]) g[SOCKET_MOCK_SERVERS_KEY] = new Map<string, Set<string>>();
if (!g[SESSION_VERSION_REGISTRY_KEY]) g[SESSION_VERSION_REGISTRY_KEY] = new Map<string, number>();

/** Tracked mock server state (last connect event payload) */
export const mockServers = g[MOCK_SERVERS_KEY] as Map<string, Record<string, unknown>>;

/** Maps socket.id → Set of mock serverIds owned by that socket */
export const socketMockServers = g[SOCKET_MOCK_SERVERS_KEY] as Map<string, Set<string>>;

/**
 * Highest `sessionVersion` ever observed for a given sessionId. Survives the
 * disconnect window so a reconnecting app that reuses its sessionId gets a
 * strictly greater generation number — never a duplicate. Cleared on socket
 * disconnect to bound memory.
 */
export const sessionVersionRegistry = g[SESSION_VERSION_REGISTRY_KEY] as Map<string, number>;

/** Compute the next sessionVersion for a given sessionId. */
export function nextSessionVersion(sessionId: string): number {
  const next = (sessionVersionRegistry.get(sessionId) ?? 0) + 1;
  sessionVersionRegistry.set(sessionId, next);
  return next;
}

/**
 * Drop every entry from the three globalThis-pinned app-namespace maps.
 *
 * Intended for full server shutdown and test isolation. Per-socket cleanup
 * lives in the disconnect handler (`removeRuntimeLayer` + per-key deletes);
 * this function is the symmetric counterpart for the shutdown path, mirroring
 * `clearBuffer()` (session-buffer) and `CatalogStore.clear()` (catalog-store).
 *
 * MUST NOT be called from per-socket disconnect handlers — use the per-key
 * delete sites in `app-namespace-handlers.ts` instead.
 */
export function clearAppNamespaceState(): void {
  mockServers.clear();
  socketMockServers.clear();
  sessionVersionRegistry.clear();
}
