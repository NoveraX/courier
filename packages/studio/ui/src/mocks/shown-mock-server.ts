import type { MockServerInfo } from "@/store/mock-slice";

/**
 * The mock the Mocks section shows: the one chosen, else the first.
 *
 * @param servers - Every mock the page knows
 * @param activeId - The mock chosen, if one is
 * @returns The mock shown, when there is any
 * @example
 * ```ts
 * shownMockServer(Object.values(servers), activeServerId);
 * ```
 */
export function shownMockServer(
  servers: readonly MockServerInfo[],
  activeId: string | null,
): MockServerInfo | undefined {
  return servers.find((each) => each.serverId === activeId) ?? servers[0];
}
