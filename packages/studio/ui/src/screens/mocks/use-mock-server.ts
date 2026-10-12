import { shownMockServer } from "@/mocks/shown-mock-server";
import type { MockServerInfo } from "@/store/mock-slice";
import { useAllServers, useMockStore } from "@/store/mock-slice";

/**
 * The mock server the Mocks pages show — the one chosen, else the first —
 * and every server.
 *
 * @returns The server shown, if any, and all of them
 * @example
 * ```ts
 * const { server, servers } = useMockServer();
 * ```
 */
export function useMockServer(): { server: MockServerInfo | undefined; servers: MockServerInfo[] } {
  const servers = useAllServers();
  const activeId = useMockStore((s) => s.activeServerId);
  return { server: shownMockServer(servers, activeId), servers };
}
