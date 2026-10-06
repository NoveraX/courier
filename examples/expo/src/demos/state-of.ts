import type { CardState } from "./card";

/**
 * A card's state from what a call is doing.
 *
 * @param call - Whether it is waiting, and why it failed
 * @returns The state
 */
export function stateOf(call: { isPending: boolean; error: Error | null }): CardState {
  if (call.error) return "failed";
  return call.isPending ? "waiting" : "ok";
}

/**
 * What a failure says, in a line.
 *
 * @param error - The failure, if any
 * @returns Its message, or an empty line
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "";
}
