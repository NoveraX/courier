import { playgroundRequestId } from "@noverax/courier-studio-core";
import { useCallback } from "react";
import { toast } from "sonner";

import { endpointName } from "@/features/requests/request-parts";
import { isStreamRequest } from "@/features/requests/request-state";
import { getSocket } from "@/socket";
import { isPlaygroundErrorPayload } from "@/socket/playground-guards";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { useInspector } from "./use-inspector";

/* How long a replay is followed: its request opens if it arrives in time. */
const FOLLOW_MS = 30_000;

/**
 * What replays a request: Studio has the app run its endpoint again, in the
 * same mode and with the same variables — the middleware sets the headers
 * afresh — and opens the new request in the inspector once it arrives, or
 * says why the app could not run it. A stream is not replayed: Studio
 * cannot open an app's own stream.
 *
 * @returns The replay, or `undefined` for a request that cannot be replayed
 * @example
 * ```ts
 * const replay = useReplay();
 * const onReplay = replay(request);
 * ```
 */
export function useReplay(): (r: RequestEntry) => (() => void) | undefined {
  const { open } = useInspector();
  return useCallback(
    (r: RequestEntry) => {
      if (isStreamRequest(r)) return undefined;
      return () => {
        const rid = crypto.randomUUID();
        const requestId = playgroundRequestId(rid);
        const socket = getSocket();
        const name = endpointName(r);
        const stop = () => {
          socket.off("playground:error", onError);
          unsubscribe();
          clearTimeout(timer);
        };
        const onError = (data: unknown) => {
          if (!isPlaygroundErrorPayload(data) || data.rid !== rid) return;
          stop();
          toast.error(`Could not replay ${name}: ${data.error.message}`);
        };
        const unsubscribe = useStudioStore.subscribe((state) => {
          if (!state.requests.some((x) => x.id === requestId)) return;
          stop();
          open(requestId);
        });
        const timer = setTimeout(stop, FOLLOW_MS);
        socket.on("playground:error", onError);
        socket.emit("playground:exec", {
          rid,
          source: r.source,
          group: r.group ?? "",
          method: r.method,
          mode: r.mode,
          transport: "http",
          variables: r.variables ?? {},
          headers: {},
        });
        toast.success(`Replaying ${name}`);
      };
    },
    [open],
  );
}
