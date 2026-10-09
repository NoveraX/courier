/**
 * The requests a bridge sends its client — a question for the person at
 * it — and the answers that come back on the client's own lines.
 */
export interface ClientAsks {
  /** Send the client a request; settles with its result, or `undefined` for an error or a client gone. */
  ask(method: string, params: Record<string, unknown>): Promise<unknown>;
  /** Take a line that answers one of the bridge's requests; `false` for any other line. */
  answered(message: Record<string, unknown>): boolean;
  /** The client closed its end: every request still waiting settles with nothing. */
  close(): void;
}

/**
 * The bridge's own requests to its client, each under an id of its own,
 * kept until the client answers it.
 *
 * @param write - Writes one line to the client
 * @returns The requests
 * @example
 * ```ts
 * const asks = createClientAsks(write);
 * const answer = await asks.ask("elicitation/create", question);
 * ```
 */
export function createClientAsks(write: (line: string) => void): ClientAsks {
  const waiting = new Map<string, (result: unknown) => void>();
  let sent = 0;
  return {
    ask: (method, params) =>
      new Promise((resolve) => {
        sent += 1;
        const id = `courier-studio-${sent}`;
        waiting.set(id, resolve);
        write(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      }),
    answered: (message) => {
      if ("method" in message || typeof message.id !== "string") return false;
      const resolve = waiting.get(message.id);
      if (resolve === undefined) return false;
      waiting.delete(message.id);
      resolve("result" in message ? message.result : undefined);
      return true;
    },
    close: () => {
      for (const resolve of waiting.values()) resolve(undefined);
      waiting.clear();
    },
  };
}
