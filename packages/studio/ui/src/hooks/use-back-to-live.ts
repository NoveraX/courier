import { useCallback } from "react";

import { getSocket } from "@/socket/socket-instance";
import { useStudioStore } from "@/store";

/**
 * Stop showing a saved session and go back to the live requests: Studio
 * forgets the session shown, and sends the page the live requests again.
 *
 * @returns The action to call
 *
 * @example
 * ```tsx
 * const backToLive = useBackToLive();
 * <Button onClick={backToLive}>Back to live</Button>
 * ```
 */
export function useBackToLive(): () => void {
  return useCallback(() => {
    useStudioStore.getState().showLive();
    getSocket().emit("view:live");
  }, []);
}
