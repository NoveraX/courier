import type { MockServerInfo } from "@/store/mock-slice";

/**
 * The mocks that already serve each of the config's sources, by source:
 * the keys of the mocks courier.mocks.ts declares for it, in order.
 *
 * @param servers - The mocks Studio tracks, by id
 * @returns The keys of each source's mocks; a source with none is absent
 * @example
 * ```ts
 * mockedSources({ shopMock: { ...server, source: "shop" } }).get("shop"); // → ["shopMock"]
 * ```
 */
export function mockedSources(
  servers: Readonly<Record<string, MockServerInfo>>,
): Map<string, string[]> {
  const mocked = new Map<string, string[]>();
  for (const server of Object.values(servers)) {
    if (!server.managed || server.source === undefined) continue;
    mocked.set(server.source, [...(mocked.get(server.source) ?? []), server.serverId].sort());
  }
  return mocked;
}
