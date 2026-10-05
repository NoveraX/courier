import { useCallback } from "react";
import { isDemoVisitor } from "@/features/demo/is-demo-visitor";
import { getSocket } from "@/socket/socket-instance";
import { useStudioStore } from "@/store";

/**
 * Clear the captured requests, here and in what Studio replays to the next
 * page that connects, keeping the pinned ones when "Preserve log" is on. A
 * visitor of a public demo clears its own page: the other visitors go on
 * seeing the requests.
 *
 * @returns The action to call
 *
 * @example
 * ```tsx
 * const clearRequests = useClearRequests();
 * <Button onClick={clearRequests}>Clear</Button>
 * ```
 */
export function useClearRequests(): () => void {
  return useCallback(() => {
    useStudioStore.getState().clearRequests();
    const { requests, studioInfo } = useStudioStore.getState();
    if (isDemoVisitor(studioInfo)) return;
    getSocket().emit("requests:clear", { keep: requests.map((r) => r.id) });
  }, []);
}
