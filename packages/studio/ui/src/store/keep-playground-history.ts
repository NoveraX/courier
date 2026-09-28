import type { StoreApi } from "zustand"

import type { StudioState } from "./store-types"
import { savePlaygroundHistory } from "./playground-history-storage"

/* A burst of stream messages is written once. */
const SAVE_DELAY_MS = 500

/**
 * Keep the store's Playground history in this browser as it changes, so a
 * reload shows the calls made before it.
 *
 * @param store - The Studio store
 * @returns A function that stops keeping it
 *
 * @example
 * ```ts
 * keepPlaygroundHistory(useStudioStore)
 * ```
 */
export function keepPlaygroundHistory(store: StoreApi<StudioState>): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.playgroundHistory === previous.playgroundHistory) return
    clearTimeout(timer)
    timer = setTimeout(() => savePlaygroundHistory(store.getState().playgroundHistory), SAVE_DELAY_MS)
  })
  return () => {
    clearTimeout(timer)
    unsubscribe()
  }
}
