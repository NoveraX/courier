/** How long a person has to answer a confirmation before the call is dropped, in milliseconds. */
const PATIENCE = 10 * 60_000;

/** A question the server put to its client, waiting for the answer to come back. */
interface Pending {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
}

/** Puts requests to a stdio client, and matches the answers that come back to them. */
export interface ClientQuestions {
  /** Put a request to the client and wait for its result. */
  ask(method: string, params: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  /** Hand over an answer the client sent; one to no question asked is ignored. */
  settle(response: { id: string | number; result?: unknown; error?: unknown }): void;
  /** Fail every question still waiting: the client is gone. */
  close(): void;
}

/**
 * The requests a stdio server puts to its client — under the revisions a
 * client opens with `initialize`, the confirmation a destructive tool needs —
 * each with an id of its own, so its answer finds it among the client's
 * messages.
 *
 * @param write - Writes one line to the client
 * @returns The questions
 * @example
 * ```ts
 * const answer = await clientQuestions(write).ask("elicitation/create", params, signal);
 * ```
 */
export function clientQuestions(write: (line: string) => void): ClientQuestions {
  const pending = new Map<string, Pending>();
  let next = 0;
  return {
    ask(method, params, signal) {
      const id = `courier-${++next}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => finish(new Error(`${method} got no answer in ${PATIENCE / 60_000} minutes`)),
          PATIENCE,
        );
        const onAbort = () =>
          finish(signal.reason instanceof Error ? signal.reason : new Error("Cancelled"));
        function finish(error?: Error, result?: unknown): void {
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          pending.delete(id);
          if (error === undefined) resolve(result);
          else reject(error);
        }
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
        pending.set(id, {
          resolve: (result) => finish(undefined, result),
          reject: (error) => finish(error),
        });
        write(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      });
    },
    settle(response) {
      const waiting = pending.get(String(response.id));
      if (waiting === undefined) return;
      if (response.error === undefined) waiting.resolve(response.result);
      else
        waiting.reject(
          new Error(`The client refused the request: ${JSON.stringify(response.error)}`),
        );
    },
    close() {
      for (const waiting of pending.values())
        waiting.reject(new Error("The client closed the connection"));
    },
  };
}
