import { useCallback } from "react";
import { getSocket } from "@/socket/socket-instance";
import { useStudioStore } from "@/store";

/**
 * Clear the captured requests, here and in what Studio replays to the next
 * page that connects, keeping the pinned ones when "Preserve log" is on.
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
    const keep = useStudioStore.getState().requests.map((r) => r.id);
    getSocket().emit("requests:clear", { keep });
  }, []);
}
