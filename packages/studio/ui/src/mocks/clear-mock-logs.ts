import { getSocket } from "@/socket";
import { useMockStore } from "@/store/mock-slice";

/**
 * Clear a mock's log: on this page, and in what Studio replays to a page
 * that loads, so the requests do not come back on a reload.
 *
 * @param serverId - The mock
 * @example
 * ```ts
 * clearMockLogs(server.serverId);
 * ```
 */
export function clearMockLogs(serverId: string): void {
  useMockStore.getState().clearServerLogs(serverId);
  getSocket().emit("mock:logs:clear", { serverId });
}
