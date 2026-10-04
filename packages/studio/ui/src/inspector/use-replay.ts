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

/** A request's replay: what runs it, or why it cannot run. */
export interface Replay {
  run: (() => void) | undefined;
  refusal: string | undefined;
}

/**
 * What replays a request: Studio has the app run its endpoint again, in the
 * same mode and with the same variables — the middleware sets the headers
 * afresh — and opens the new request in the inspector once it arrives, or
 * says why the app could not run it — held, while recording pauses, until
 * it resumes. A stream is not replayed: Studio cannot open an app's own
 * stream; nor is a request of a saved session while it shows, since the
 * live requests are left out meanwhile.
 *
 * @returns What makes a request's replay
 * @example
 * ```ts
 * const { run, refusal } = useReplay()(request);
 * ```
 */
export function useReplay(): (r: RequestEntry) => Replay {
  const { open } = useInspector();
  const sessionShown = useStudioStore((s) => s.shownSession !== null);
  return useCallback(
    (r: RequestEntry): Replay => {
      if (isStreamRequest(r)) {
        return { run: undefined, refusal: "A stream cannot be replayed from Studio" };
      }
      if (sessionShown) {
        return { run: undefined, refusal: "Go back to the live requests to replay one" };
      }
      const run = () => {
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
          const arrived = [state.requests, state.heldRequests].some((list) =>
            list.some((x) => x.id === requestId),
          );
          if (!arrived) return;
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
      return { run, refusal: undefined };
    },
    [open, sessionShown],
  );
}
