import type { StudioSet } from "./store-access";
import type { StudioState } from "./store-types";
import type { BindingSnapshot } from "./types-ui";

type ConnectionActions = Pick<
  StudioState,
  | "setStudioInfo"
  | "setConnectionStatus"
  | "setReconnectAttempt"
  | "setBindingSnapshot"
  | "setBindingError"
>;

/**
 * The Studio store's actions for its connection to Studio — what Studio
 * tells of itself, and the runtimes bound to it.
 *
 * The binding snapshot is Studio's own account of the runtimes. The session
 * timer (`sessionStartedAt`) is Studio's too: from the first runtime's
 * arrival until the last one leaves, as Studio saw it, so a page that opens
 * or reloads meanwhile shows the same time, and none counts from a session
 * that ended while no page was open. Requests are NOT cleared on these transitions,
 * because the Studio dev server can have several cooperating runtimes
 * (browser direct + Next.js server proxy) that HMR/Turbopack rebuilds blip
 * constantly, and losing one side's request history on such a blip is
 * surprising and asymmetric. `clearRequests()` is the explicit wipe.
 *
 * @param set - The store's `set`
 * @returns The actions
 *
 * @example
 * ```ts
 * create<StudioState>((set, get) => ({ ...createConnectionActions(set), ... }));
 * ```
 */
export function createConnectionActions(set: StudioSet): ConnectionActions {
  return {
    setStudioInfo: (info) => set({ studioInfo: info }),
    setConnectionStatus: (status) => {
      set({ connectionStatus: status, connected: status === "connected" });
      if (status === "connected") set({ reconnectAttempt: 0 });
    },
    setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),
    setBindingSnapshot: (snapshot: BindingSnapshot) =>
      set((s) => {
        const sessionStartedAt = snapshot.runtimeCount > 0 ? (snapshot.activeSince ?? null) : null;
        // A binding error is cleared once its conflict row is gone from the
        // snapshot. The server emits binding:error only at the moment of
        // conflict, and the next clean snapshot is its "all good now"; kept,
        // a resolved conflict would leave a red badge in the status bar
        // until the page reloads.
        let lastBindingError = s.lastBindingError;
        if (lastBindingError) {
          const stillConflicting = snapshot.rows.some(
            (r) =>
              r.status === "conflict" &&
              r.sourceName === lastBindingError?.details.sourceName &&
              r.transport === lastBindingError?.details.transport,
          );
          if (!stillConflicting) lastBindingError = null;
        }
        return { bindingSnapshot: snapshot, sessionStartedAt, lastBindingError };
      }),
    setBindingError: (error) => set({ lastBindingError: error }),
  };
}
