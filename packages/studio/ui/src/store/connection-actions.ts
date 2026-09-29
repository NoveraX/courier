import { saveSessionStartedAt } from "./constants";
import type { StudioSet } from "./store-access";
import type { StudioState } from "./store-types";
import type { BindingSnapshot } from "./types-ui";

type ConnectionActions = Pick<
  StudioState,
  "setConnectionStatus" | "setReconnectAttempt" | "setBindingSnapshot" | "setBindingError"
>;

/**
 * The Studio store's actions for its connection to Studio and the runtimes
 * bound to it.
 *
 * The binding snapshot is Studio's own account of the runtimes. The session
 * timer (`sessionStartedAt`) runs from the first runtime's arrival until
 * the last one leaves; requests are NOT cleared on these transitions,
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
    setConnectionStatus: (status) => {
      set({ connectionStatus: status, connected: status === "connected" });
      if (status === "connected") set({ reconnectAttempt: 0 });
    },
    setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),
    setBindingSnapshot: (snapshot: BindingSnapshot) =>
      set((s) => {
        const wasIdle = s.bindingSnapshot.runtimeCount === 0;
        const isActive = snapshot.runtimeCount > 0;
        let sessionStartedAt = s.sessionStartedAt;
        if (wasIdle && isActive) {
          sessionStartedAt = sessionStartedAt ?? Date.now();
          if (!s.sessionStartedAt) saveSessionStartedAt(sessionStartedAt);
        } else if (!isActive && s.sessionStartedAt) {
          sessionStartedAt = null;
          saveSessionStartedAt(null);
        }
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
