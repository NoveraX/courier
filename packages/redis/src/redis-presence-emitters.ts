/**
 * Internal event emitters and shared context for the Redis presence adapter.
 *
 * Owns the per-instance error and diff handler registries and the
 * `PresenceContext` type that is threaded through every operation helper
 * (track, update, list, sweep, etc.).
 */

import type { PresenceDiff } from "@noverax/courier/realtime";
import type { Redis } from "ioredis";

export type DiffHandler = (diff: PresenceDiff) => void;

export interface PresenceContext {
  readonly redis: Redis;
  readonly prefix: string;
  readonly errorHandlers: Set<(error: Error) => void>;
  readonly diffHandlers: Map<string, Set<DiffHandler>>;
  readonly emitError: (error: Error) => void;
  readonly emitDiff: (topic: string, diff: PresenceDiff) => void;
  readonly sk: (topic: string) => string;
  readonly mk: (topic: string) => string;
  isConnected(): boolean;
}

/** Convert any thrown value to a real `Error` instance */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Build the per-instance error emitter — invokes every registered handler */
export function createErrorEmitter(
  errorHandlers: Set<(error: Error) => void>,
): (error: Error) => void {
  return (error: Error): void => {
    for (const handler of errorHandlers) handler(error);
  };
}

/**
 * Build the per-instance diff emitter.
 * Each diff handler is invoked inside a try/catch so that a buggy listener
 * cannot break delivery to other listeners — failures are routed back into
 * the error emitter for normal observability.
 */
export function createDiffEmitter(
  diffHandlers: Map<string, Set<DiffHandler>>,
  emitError: (error: Error) => void,
): (topic: string, diff: PresenceDiff) => void {
  return (topic: string, diff: PresenceDiff): void => {
    const handlers = diffHandlers.get(topic);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(diff);
      } catch (err) {
        emitError(toError(err));
      }
    }
  };
}
