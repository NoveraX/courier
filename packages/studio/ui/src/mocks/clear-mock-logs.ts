import { isDemoVisitor } from "@/features/demo/is-demo-visitor";
import { getSocket } from "@/socket";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";

/**
 * Clear a mock's log: on this page, and in what Studio replays to a page
 * that loads, so the requests do not come back on a reload. A visitor of a
 * public demo clears its own page: the other visitors go on seeing the log.
 *
 * @param serverId - The mock
 * @example
 * ```ts
 * clearMockLogs(server.serverId);
 * ```
 */
export function clearMockLogs(serverId: string): void {
  useMockStore.getState().clearServerLogs(serverId);
  if (isDemoVisitor(useStudioStore.getState().studioInfo)) return;
  getSocket().emit("mock:logs:clear", { serverId });
}
