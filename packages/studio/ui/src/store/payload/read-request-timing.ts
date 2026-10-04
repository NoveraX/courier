import type { RequestTiming } from "../types";
import { readNumbers } from "./read-numbers";

const KEYS = ["total", "middleware", "fetch", "validation"] as const;

/**
 * A request's timing breakdown from a socket event, or `undefined`.
 *
 * @param value - The field as the socket parsed it
 * @returns The timing, or `undefined` when a phase is missing
 * @example
 * ```ts
 * readRequestTiming({ total: 9, middleware: 1, fetch: 7, validation: 1 });
 * ```
 */
export function readRequestTiming(value: unknown): RequestTiming | undefined {
  return readNumbers(value, KEYS);
}
