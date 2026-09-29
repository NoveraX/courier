import { mockServerOf } from "@/store/mock-server-of";
import type { MockServerInfo } from "@/store/mock-slice";

/** How long after the mocks are added the wizard waits before saying one is late. */
export const ARRIVAL_PATIENCE_MS = 15_000;

/** Which of the mocks added Studio lists yet. */
export interface MockArrival {
  /** The mocks listed, in the order of the keys. */
  listed: MockServerInfo[];
  /** The keys not listed yet. */
  pending: string[];
  /** Whether a key is still missing once the patience ran out. */
  overdue: boolean;
}

/**
 * Which of the mocks Studio added it lists yet. Studio lists a mock under
 * its key once it has loaded the edited file (`mock:server:connect`); that
 * may come before or after the apply's answer. A key is looked up among
 * the listed mocks' own ids only, so an inherited name is never mistaken
 * for a mock.
 *
 * @param servers - The mock store's servers by id
 * @param keys - The keys Studio added
 * @param elapsedMs - Time since the apply's answer arrived
 * @returns The mocks listed, the keys still missing, and whether they are late
 *
 * @example
 * ```ts
 * mockArrival({}, ["toString"], 20_000);
 * // → { listed: [], pending: ["toString"], overdue: true }
 * ```
 */
export function mockArrival(
  servers: Readonly<Record<string, MockServerInfo>>,
  keys: readonly string[],
  elapsedMs: number,
): MockArrival {
  const listed: MockServerInfo[] = [];
  const pending: string[] = [];
  for (const key of keys) {
    const server = mockServerOf(servers, key);
    if (server) listed.push(server);
    else pending.push(key);
  }
  return { listed, pending, overdue: pending.length > 0 && elapsedMs >= ARRIVAL_PATIENCE_MS };
}
