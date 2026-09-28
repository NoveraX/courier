import type { ResolvedHandler } from "../types";

/**
 * Pick the handler that answers a call from one layer's stack: the newest
 * one whose required state matches, counting down — and dropping once used
 * up — a handler limited with `once()` or `times()`.
 *
 * @param stack         One layer's handlers for an endpoint, oldest first
 * @param scenarioState The state the call is made in
 * @returns The handler, or `undefined` when none matches the state
 * @example
 * ```ts
 * resolveHandler(stack, "Started");
 * ```
 */
export function resolveHandler(
  stack: ResolvedHandler[],
  scenarioState: string,
): ResolvedHandler | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    const handler = stack[i];
    if (!handler) continue;

    if (handler.requiredState && handler.requiredState !== scenarioState) {
      continue;
    }

    if (handler.remaining !== undefined) {
      handler.remaining--;
      if (handler.remaining <= 0) stack.splice(i, 1);
    }

    return handler;
  }

  return undefined;
}
