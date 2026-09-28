import type { ResolvedHandler } from "../types";

/**
 * The handler as one call sees it.
 *
 * A handler without a sequence answers every call alike and comes back as it
 * is. One with a sequence takes its next step now, while the call is being
 * resolved, and comes back as a copy that answers with that step. The step's
 * status, error flag and delay are therefore in place before the call is
 * delayed and checked for an error, and a concurrent call — holding a copy of
 * its own — never reads them.
 *
 * @param handler - The handler the registry resolved for the call
 * @returns The handler to answer this one call with
 * @example
 * ```ts
 * const handler = handlerForCall(stack[i]);
 * if (handler.delayMs) await sleep(handler.delayMs);
 * ```
 */
export function handlerForCall(handler: ResolvedHandler): ResolvedHandler {
  if (!handler.nextStep) return handler;
  const step = handler.nextStep();
  return {
    ...handler,
    fn: () => step.data,
    status: step.status ?? handler.status,
    isError: step.isError,
    delayMs: step.delayMs ?? handler.delayMs,
  };
}
