import { MockHttpError } from "./errors";

/** What a mock remembers of a write it carried out under a key. */
interface Remembered {
  readonly variables: string;
  readonly answer?: { readonly data: unknown; readonly status: number } | undefined;
  readonly at: number;
}

/** How a mock treats a write's idempotency key. */
export interface IdempotencyOptions {
  /** The headers a key is read from, in any case (default: `idempotency-key`). */
  readonly headers?: readonly string[] | undefined;
  /** How long a key is remembered, in milliseconds (default: a day). */
  readonly ttlMs?: number | undefined;
  /** How many keys are remembered at most, the oldest let go first (default: 1 000). */
  readonly limit?: number | undefined;
}

/** A write's answer, carried out now or remembered from the first time its key came. */
export interface KeyedAnswer {
  readonly data: unknown;
  readonly status: number;
  /** Whether it is the first call's answer, given again. */
  readonly replayed: boolean;
}

/** Answers a write once per key, as an API that deduplicates by its idempotency key does. */
export interface IdempotentCalls {
  /**
   * Run a write — or, when its key came before with the same variables,
   * give the answer it got then without running it again.
   *
   * @throws MockHttpError 409 while the first call under the key still runs,
   *   422 when the key came before with other variables
   */
  answer(
    headers: Headers,
    call: { group: string; method: string; variables: unknown },
    run: () => Promise<{ data: unknown; status: number }>,
  ): Promise<KeyedAnswer>;
}

/**
 * The mock's memory of the writes it carried out under an idempotency key:
 * a write sent again with its key — a retry, a double click — gets the
 * first answer back, and nothing is created twice, so a client's retries
 * can be tested as an API that deduplicates would answer them. A key sent
 * with other variables is refused, as is one whose first call still runs. A
 * call that failed is not remembered, so its retry runs again.
 *
 * @param options - The headers a key is read from, and how long and how many are kept
 * @returns The memory
 * @example
 * ```ts
 * const keyed = idempotentCalls({ headers: ["idempotency-key"] });
 * await keyed.answer(request.headers, { group: "orders", method: "place", variables }, run);
 * ```
 */
export function idempotentCalls(options: IdempotencyOptions = {}): IdempotentCalls {
  const headers = (options.headers ?? ["idempotency-key"]).map((name) => name.toLowerCase());
  const ttlMs = options.ttlMs ?? 24 * 60 * 60_000;
  const limit = options.limit ?? 1_000;
  const remembered = new Map<string, Remembered>();

  return {
    async answer(requestHeaders, call, run) {
      const sent = headers.map((name) => requestHeaders.get(name)).find((value) => value);
      if (!sent) return { ...(await run()), replayed: false };
      const key = `${call.group}/${call.method}/${sent}`;
      const variables = canonical(call.variables);
      const now = Date.now();
      const before = remembered.get(key);
      if (before !== undefined && now - before.at < ttlMs) {
        if (before.variables !== variables) {
          throw new MockHttpError(
            422,
            `The idempotency key ${sent} was sent before with other variables`,
          );
        }
        if (before.answer === undefined) {
          throw new MockHttpError(
            409,
            `The call sent with the idempotency key ${sent} is still running`,
          );
        }
        return { ...before.answer, replayed: true };
      }
      remembered.delete(key);
      remembered.set(key, { variables, at: now });
      while (remembered.size > limit) remembered.delete(remembered.keys().next().value as string);
      try {
        const answer = await run();
        remembered.set(key, { variables, answer, at: now });
        return { ...answer, replayed: false };
      } catch (error) {
        remembered.delete(key);
        throw error;
      }
    },
  };
}

/* Keys sorted, so a retry that rebuilt its variables in another order sends the same ones. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value) ?? "null";
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, inner]) => inner !== undefined,
  );
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([name, inner]) => `${JSON.stringify(name)}:${canonical(inner)}`).join(",")}}`;
}
