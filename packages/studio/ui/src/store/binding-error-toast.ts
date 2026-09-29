/**
 * Surfaces a `binding:error` payload as a toast notification.
 *
 * Used by `socket-bindings.ts` whenever the server emits `binding:error` —
 * the persistent badge in the status bar reads from `lastBindingError` slice
 * directly, this helper is the transient notification on the moment of
 * arrival so the user notices the conflict even when the status bar is off
 * the first viewport.
 */

import { toast } from "sonner";

import type { BindingErrorPayload } from "./types-ui";

export function showBindingErrorToast(error: BindingErrorPayload): void {
  const { sourceName, transport, runtimeIds } = error.details;
  const claimants = runtimeIds.length > 0 ? runtimeIds.join(", ") : "(unknown)";
  toast.error(`Binding conflict on ${sourceName} (${transport})`, {
    description: `Multiple runtimes claimed this source: ${claimants}. Stop all but one to resolve.`,
  });
}

/**
 * Say that a second process claims a runtime id already in use.
 *
 * @param runtimeId - The id both claim
 *
 * @example
 * ```ts
 * showDuplicateRuntimeToast("server")
 * ```
 */
export function showDuplicateRuntimeToast(runtimeId: string): void {
  toast.warning(`Two runtimes claim the id "${runtimeId}"`, {
    description:
      "Playground calls stay with the one that connected first. Give each process its own runtimeId, or stop the copy.",
  });
}
