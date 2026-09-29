import { PLAYGROUND_MAX_HISTORY } from "./constants";
import type { StudioSet } from "./store-access";
import type { StudioState } from "./store-types";
import type { PlaygroundHistoryEntry } from "./types-ui";

type PlaygroundActions = Pick<
  StudioState,
  | "addPlaygroundEntry"
  | "updatePlaygroundEntry"
  | "setPlaygroundActiveResponse"
  | "clearPlaygroundHistory"
  | "appendPlaygroundChunk"
  | "endPlayground"
  | "errorPlayground"
>;

/**
 * The Studio store's playground actions: its history, and the rid-keyed
 * reducers the socket listeners call for `playground:chunk`,
 * `playground:end` and `playground:error`. Those are routed by the `rid`
 * stamped on the entry at send time, so the history stays decoupled from
 * any server-assigned correlation id.
 *
 * An answer for an entry cleared from the history ("Clear") changes
 * nothing: the server drains its in-flight entry via `onUiDisconnect` on
 * the next socket teardown, so dropping it here leaks no state.
 *
 * @param set - The store's `set`
 * @returns The actions
 *
 * @example
 * ```ts
 * create<StudioState>((set, get) => ({ ...createPlaygroundActions(set), ... }));
 * ```
 */
export function createPlaygroundActions(set: StudioSet): PlaygroundActions {
  return {
    addPlaygroundEntry: (entry) =>
      set((s) => ({
        playgroundHistory: [entry, ...s.playgroundHistory].slice(0, PLAYGROUND_MAX_HISTORY),
        playgroundActiveResponse: entry,
      })),
    updatePlaygroundEntry: (id, patch) =>
      set((s) => {
        const updated = s.playgroundHistory.map((h) => (h.id === id ? { ...h, ...patch } : h));
        const active =
          s.playgroundActiveResponse?.id === id
            ? { ...s.playgroundActiveResponse, ...patch }
            : s.playgroundActiveResponse;
        return { playgroundHistory: updated, playgroundActiveResponse: active };
      }),
    setPlaygroundActiveResponse: (entry) => set({ playgroundActiveResponse: entry }),
    clearPlaygroundHistory: () => set({ playgroundHistory: [], playgroundActiveResponse: null }),
    appendPlaygroundChunk: (rid, chunk) =>
      set((s) => {
        const patch = (entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry => {
          /* Progress replaces the last; it is not kept as part of the answer. */
          if (chunk.kind === "upload-progress") {
            const { loaded, total, percentage } = chunk;
            return { ...entry, upload: { loaded, total, percentage } };
          }
          const nextChunks = [...(entry.chunks ?? []), chunk];
          const next: PlaygroundHistoryEntry = { ...entry, chunks: nextChunks };
          if (chunk.kind === "http-result") {
            next.statusCode = chunk.status;
            // An error answer's body says more than the message lifted from it.
            next.response = chunk.data !== undefined ? chunk.data : chunk.error;
            if (chunk.headers) next.responseHeaders = chunk.headers;
          } else if (entry.streamStatus === "connecting") {
            next.streamStatus = "streaming";
          }
          return next;
        };
        const updated = s.playgroundHistory.map((h) => (h.rid === rid ? patch(h) : h));
        const active =
          s.playgroundActiveResponse?.rid === rid
            ? patch(s.playgroundActiveResponse)
            : s.playgroundActiveResponse;
        return { playgroundHistory: updated, playgroundActiveResponse: active };
      }),
    endPlayground: (rid, summary) =>
      set((s) => {
        const patch = (entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry => {
          // A failing http-result keeps the "error" status rather than
          // flipping to success on the terminal end event.
          const errored =
            entry.status === "error" ||
            (entry.chunks?.some((c) => c.kind === "http-result" && c.error !== undefined) ?? false);
          return {
            ...entry,
            status: errored ? "error" : "success",
            duration: summary.durationMs,
            streamStatus: entry.transport ? (errored ? "error" : "complete") : entry.streamStatus,
          };
        };
        const updated = s.playgroundHistory.map((h) => (h.rid === rid ? patch(h) : h));
        const active =
          s.playgroundActiveResponse?.rid === rid
            ? patch(s.playgroundActiveResponse)
            : s.playgroundActiveResponse;
        return { playgroundHistory: updated, playgroundActiveResponse: active };
      }),
    errorPlayground: (rid, error) =>
      set((s) => {
        const patch = (entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry => ({
          ...entry,
          status: "error",
          response: error.message,
          streamStatus: entry.transport ? "error" : entry.streamStatus,
        });
        const updated = s.playgroundHistory.map((h) => (h.rid === rid ? patch(h) : h));
        const active =
          s.playgroundActiveResponse?.rid === rid
            ? patch(s.playgroundActiveResponse)
            : s.playgroundActiveResponse;
        return { playgroundHistory: updated, playgroundActiveResponse: active };
      }),
  };
}
