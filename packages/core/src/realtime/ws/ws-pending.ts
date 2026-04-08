import { ConnectionError, fromErrorCode, TimeoutError } from "../errors";
import type { WSMessage } from "./ws-protocol";

/** Pending request-response entry */
interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Registry for correlation-based WS request-response */
export interface PendingRegistry {
  /** Register a pending request. Returns the correlation ID. */
  register(resolve: (v: unknown) => void, reject: (e: Error) => void, timeoutMs: number): string;
  /** Resolve a pending request by message (matched by msg.id). */
  resolve(msg: WSMessage): boolean;
  /** Reject a pending request by error message (matched by msg.id). */
  reject(msg: WSMessage): boolean;
  /** Check if a correlation ID has a pending request. */
  has(id: string): boolean;
  /** Reject all pending requests with a reason. */
  rejectAll(reason: string): void;
}

/**
 * Create a pending request registry for WS request-response pattern.
 * Tracks correlation IDs, resolves/rejects promises, handles timeouts.
 *
 * @returns PendingRegistry instance
 */
export function createPendingRegistry(): PendingRegistry {
  const entries = new Map<string, PendingEntry>();
  let nextId = 0;

  return {
    register(resolve, reject, timeoutMs) {
      const id = String(++nextId);
      const timer = setTimeout(() => {
        entries.delete(id);
        reject(new TimeoutError(`WS request timeout (${timeoutMs}ms)`));
      }, timeoutMs);
      entries.set(id, { resolve, reject, timer });
      return id;
    },

    resolve(msg) {
      if (!msg.id) return false;
      const entry = entries.get(msg.id);
      if (!entry) return false;
      clearTimeout(entry.timer);
      entries.delete(msg.id);
      entry.resolve(msg.payload);
      return true;
    },

    reject(msg) {
      if (!msg.id) return false;
      const entry = entries.get(msg.id);
      if (!entry) return false;
      clearTimeout(entry.timer);
      entries.delete(msg.id);
      entry.reject(fromErrorCode(msg.error?.code ?? 5000, msg.error?.message ?? "Server error"));
      return true;
    },

    has(id) {
      return entries.has(id);
    },

    rejectAll(reason) {
      for (const [id, entry] of entries) {
        clearTimeout(entry.timer);
        entry.reject(new ConnectionError(reason));
        entries.delete(id);
      }
    },
  };
}
