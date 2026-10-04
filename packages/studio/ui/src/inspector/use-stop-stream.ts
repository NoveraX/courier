import { useCallback } from "react";
import { toast } from "sonner";

import { endpointName } from "@/features/requests/request-parts";
import { requestStateOf } from "@/features/requests/request-state";
import { getSocket } from "@/socket";
import type { RequestEntry } from "@/store/types";
import { forgetStream, streamRunOf } from "./streams-opened-here";

/**
 * What stops a stream this page reconnected while it is still open: the
 * runtime that opened it closes it, and its row says it ended. A stream
 * the app itself opened is the app's to close, so it gets no stop.
 *
 * @returns What makes a request's stop, `undefined` when it has none
 * @example
 * ```ts
 * const stop = useStopStream()(request);
 * if (stop) stop();
 * ```
 */
export function useStopStream(): (r: RequestEntry) => (() => void) | undefined {
  return useCallback((r: RequestEntry) => {
    const rid = streamRunOf(r.id);
    if (rid === undefined || requestStateOf(r) !== "streaming") return undefined;
    return () => {
      getSocket().emit("playground:exec:cancel", { rid });
      forgetStream(r.id);
      toast.success(`Stopped ${endpointName(r)}`);
    };
  }, []);
}
