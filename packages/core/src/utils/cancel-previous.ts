import { HTTPError } from "../errors";
import { studioHooks } from "../studio";

/** Where the calls still in flight that a newer one cancels are kept, by endpoint. */
export type CancellableCalls = {
  pendingRequests: { [key: string]: AbortController };
};

export const supportsAbortController = typeof globalThis.AbortController === "function";

/** A new call that took an endpoint over, and how to cancel the one it superseded. */
export interface Supersession {
  /** The new call's controller, kept in the place of the call still in flight. */
  readonly controller: AbortController;
  /**
   * Cancel the call superseded, if there was one: it rejects with an
   * `HTTPError` of status 499, and Studio is told it was superseded.
   */
  readonly cancelSuperseded: () => void;
}

/**
 * Take an endpoint over for a new call, keeping its controller in the place
 * of the call still in flight. Cancel the superseded call once the new one
 * has started: a new call identical to it then joins the request it made
 * rather than send another.
 *
 * @param host - Where the calls in flight are kept
 * @param key - The endpoint, as the call names it
 * @returns The new call's controller, and how to cancel the call it superseded
 * @example
 * ```ts
 * const { controller, cancelSuperseded } = supersedeCall(host, "api:users.search");
 * const sending = fetch(url, { signal: controller.signal });
 * cancelSuperseded();
 * ```
 */
export function supersedeCall(host: CancellableCalls, key: string): Supersession {
  const superseded = host.pendingRequests[key];
  const controller = new AbortController();
  host.pendingRequests[key] = controller;
  return {
    controller,
    cancelSuperseded: () => {
      if (superseded === undefined) return;
      studioHooks.onCallSuperseded?.({ key, timestamp: Date.now() });
      studioHooks.onRequestAbort?.({ id: key, reason: "superseded", timestamp: Date.now() });
      superseded.abort(
        new HTTPError({
          data: { success: false, message: "cancel request" },
          status: 499,
          headers: new Headers(),
        }),
      );
    },
  };
}

/**
 * Forget a call that ended, unless a newer one has taken its place.
 *
 * @param host - Where the calls in flight are kept
 * @param key - The endpoint, as the call names it
 * @param controller - The call's controller
 * @example
 * ```ts
 * forgetCall(host, "api:users.search", controller);
 * ```
 */
export function forgetCall(host: CancellableCalls, key: string, controller: AbortController): void {
  if (host.pendingRequests[key] === controller) {
    delete host.pendingRequests[key];
  }
}
