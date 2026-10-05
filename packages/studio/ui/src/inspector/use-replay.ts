import { playgroundRequestId } from "@noverax/courier-studio-core";
import { useCallback } from "react";
import { toast } from "sonner";

import { endpointName } from "@/features/requests/request-parts";
import { isStreamRequest } from "@/features/requests/request-state";
import { streamMessages } from "@/features/requests/stream-summary";
import { getSocket } from "@/socket";
import { isPlaygroundErrorPayload } from "@/socket/playground-guards";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { rememberStream } from "./streams-opened-here";
import { useInspector } from "./use-inspector";

/* How long a replay is followed: its request opens if it arrives in time. */
const FOLLOW_MS = 30_000;

/** A request's replay: what its control says, what runs it, and why it cannot run. */
export interface Replay {
  /** "Replay request", or "Reconnect" for a stream. */
  label: string;
  /** What the control's tooltip says: the label and what it leaves out, or why it cannot run. */
  title: string;
  run: (() => void) | undefined;
}

/* What a replay sends the runtime: the call as it was made, by the runtime that made it. */
function callOf(r: RequestEntry, rid: string): Record<string, unknown> {
  return {
    rid,
    source: r.source,
    group: r.group ?? "",
    method: r.method,
    mode: r.mode,
    transport: r.transport ?? "http",
    variables: r.variables ?? {},
    headers: {},
    runtimeId: r.callerRuntimeId ?? r.sessionId,
  };
}

/* A channel's reconnect opens it again; what the page sent into it is not sent again. */
function titleOf(r: RequestEntry, label: string): string {
  const sent = streamMessages(r).some((m) => m.direction === "sent");
  return sent ? `${label} · the messages it sent are not sent again` : label;
}

/* Follow a run: open its request once it arrives — held while recording
   pauses — or say why the runtime could not run it. */
function follow(rid: string, failure: string, onArrive: (requestId: string) => void): void {
  const requestId = playgroundRequestId(rid);
  const socket = getSocket();
  const stop = () => {
    socket.off("playground:error", onError);
    unsubscribe();
    clearTimeout(timer);
  };
  const onError = (data: unknown) => {
    if (!isPlaygroundErrorPayload(data) || data.rid !== rid) return;
    stop();
    toast.error(`${failure}: ${data.error.message}`);
  };
  const unsubscribe = useStudioStore.subscribe((state) => {
    const lists = [state.requests, state.heldRequests];
    if (!lists.some((list) => list.some((x) => x.id === requestId))) return;
    stop();
    onArrive(requestId);
  });
  const timer = setTimeout(stop, FOLLOW_MS);
  socket.on("playground:error", onError);
}

/**
 * What replays a request: Studio has the runtime that made it run the same
 * endpoint again — in the same mode, with the same variables, the
 * middleware setting the headers afresh — and opens the new request in the
 * inspector once it arrives, held while recording pauses, or says why the
 * runtime could not run it. A stream reconnects the same way, and stays
 * open until its server ends it or it is stopped from here. Nothing runs
 * while a saved session shows, since the live requests are left out
 * meanwhile.
 *
 * @returns What makes a request's replay
 * @example
 * ```ts
 * const { run, title } = useReplay()(request);
 * ```
 */
export function useReplay(): (r: RequestEntry) => Replay {
  const { open } = useInspector();
  const sessionShown = useStudioStore((s) => s.shownSession !== null);
  return useCallback(
    (r: RequestEntry): Replay => {
      const stream = isStreamRequest(r);
      const label = stream ? "Reconnect" : "Replay request";
      if (sessionShown) {
        return { label, title: "Go back to the live requests to run it again", run: undefined };
      }
      const run = () => {
        const rid = crypto.randomUUID();
        const name = endpointName(r);
        follow(rid, `Could not ${stream ? "reconnect" : "replay"} ${name}`, open);
        if (stream) rememberStream(playgroundRequestId(rid), rid);
        getSocket().emit("playground:exec", callOf(r, rid));
        toast.success(`${stream ? "Reconnecting" : "Replaying"} ${name}`);
      };
      return { label, title: titleOf(r, label), run };
    },
    [open, sessionShown],
  );
}
