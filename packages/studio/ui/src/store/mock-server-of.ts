import type { MockServerInfo } from "./mock-slice-types";

/**
 * The mock listed under an id, looked up among the list's own entries only.
 * Mock keys are the developer's names, and one such as `toString` or
 * `constructor` would otherwise find what every object inherits.
 *
 * @param servers - The mocks by id, as the mock store holds them
 * @param serverId - The mock's id, which is its key in `courier.mocks.ts`
 * @returns The mock, or `undefined` when none is listed under that id
 *
 * @example
 * ```ts
 * mockServerOf({}, "toString"); // → undefined
 * mockServerOf(useMockStore.getState().servers, "apiMock");
 * ```
 */
export function mockServerOf(
  servers: Readonly<Record<string, MockServerInfo>>,
  serverId: string,
): MockServerInfo | undefined {
  return Object.hasOwn(servers, serverId) ? servers[serverId] : undefined;
}
