import { useCallback } from "react";

import { getSocket } from "@/socket";
import { useStudioStore } from "@/store";

/**
 * Pin a request, or unpin it — on this page, and, for a page with the
 * token, in the project, so another browser and the next visit show it
 * pinned too, and the log keeps it as it lets its oldest requests go.
 *
 * @returns Toggles the pin of the request named
 * @example
 * ```tsx
 * const togglePin = useTogglePin();
 * <button onClick={() => togglePin(request.id)}>Pin</button>
 * ```
 */
export function useTogglePin(): (id: string) => void {
  return useCallback((id: string) => {
    const store = useStudioStore.getState();
    store.togglePin(id);
    const pinned = useStudioStore.getState().requests.find((r) => r.id === id)?.pinned === true;
    if (store.projectWritable) getSocket().emit("requests:pin", { id, pinned });
  }, []);
}
