import { useCallback } from "react";

import { getSocket } from "@/socket/socket-instance";
import { useStudioStore } from "@/store";

/**
 * Stop showing a saved session and go back to the live requests: Studio
 * forgets the session shown, and sends the page the live requests again,
 * which it shows loading until they come. Only a page with Studio's token
 * changes what the pages show: one without is told so, and keeps showing
 * the session Studio still shows.
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
    const studio = useStudioStore.getState();
    if (studio.projectWritable) studio.showLive();
    getSocket().emit("view:live");
  }, []);
}
