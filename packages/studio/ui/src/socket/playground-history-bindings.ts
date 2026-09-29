import type { Socket } from "socket.io-client";
import type { StoreApi } from "zustand";

import { keptPlaygroundHistory, readPlaygroundHistory } from "@/store/playground-history-storage";
import type { StudioState } from "@/store/store-types";

/* A burst of stream messages is sent once. */
const SAVE_DELAY_MS = 500;

/**
 * Keep the Playground history in Studio, for the project: a page that
 * connects takes the history Studio kept, unless it already has one of its
 * own, which is newer; each change the page makes is sent back.
 *
 * @param socket - The `/ui` socket
 * @param store - The Studio store
 * @returns Removes the listeners, and the change it has not yet sent
 *
 * @example
 * ```ts
 * const unbindHistory = bindPlaygroundHistory(getSocket(), useStudioStore)
 * ```
 */
export function bindPlaygroundHistory(socket: Socket, store: StoreApi<StudioState>): () => void {
  let fromStudio: StudioState["playgroundHistory"] | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onHistory = (raw: unknown): void => {
    if (store.getState().playgroundHistory.length > 0) return;
    fromStudio = readPlaygroundHistory(raw);
    store.setState({ playgroundHistory: fromStudio });
  };
  const unsubscribe = store.subscribe((state, previous) => {
    const history = state.playgroundHistory;
    if (history === previous.playgroundHistory || history === fromStudio) return;
    clearTimeout(timer);
    timer = setTimeout(
      () => socket.emit("playground:history:save", keptPlaygroundHistory(history)),
      SAVE_DELAY_MS,
    );
  });

  socket.on("playground:history", onHistory);
  return () => {
    socket.off("playground:history", onHistory);
    clearTimeout(timer);
    unsubscribe();
  };
}
