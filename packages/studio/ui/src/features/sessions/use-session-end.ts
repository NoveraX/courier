import { useMemo } from "react";

import { useStudioStore } from "@/store";
import { sessionEnd } from "./shown-now";

/**
 * When the saved session shown ended, or `undefined` while the live
 * requests show: a call still in flight when a session was saved, or a
 * stream still open, is read against that moment rather than the clock, so
 * it neither keeps counting nor stretches the views across the days since.
 *
 * @returns The moment the session ended, or `undefined` for the live requests
 * @example
 * ```ts
 * const endedAt = useSessionEnd();
 * durationOf(request, state, { now, endedAt, slowMs });
 * ```
 */
export function useSessionEnd(): number | undefined {
  const saved = useStudioStore((s) => s.shownSession !== null);
  const requests = useStudioStore((s) => s.requests);
  return useMemo(() => (saved ? sessionEnd(requests) : undefined), [saved, requests]);
}
