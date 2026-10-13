import { createLogger } from "../logger";

/** An answer a render keeps for the reads it makes again: everything a `Response` carries. */
export interface KeptAnswer {
  readonly status: number;
  readonly statusText: string;
  readonly headers: ReadonlyArray<readonly [string, string]>;
  readonly body: ArrayBuffer;
  readonly url: string;
  readonly redirected: boolean;
}

const log = createLogger("Caller");

/* Statuses whose answer has no body, which a `Response` refuses one for. */
const NULL_BODY: ReadonlySet<number> = new Set([101, 103, 204, 205, 304]);

/**
 * Read a copy of an answer whole, to keep it.
 *
 * @param copy - A copy of the answer, which nothing else reads
 * @returns The answer kept, or `undefined` when its body did not arrive whole
 * @example
 * ```ts
 * const kept = await keepAnswer(response.clone());
 * ```
 */
export async function keepAnswer(copy: Response): Promise<KeptAnswer | undefined> {
  try {
    return {
      body: await copy.arrayBuffer(),
      status: copy.status,
      statusText: copy.statusText,
      headers: [...copy.headers],
      url: copy.url,
      redirected: copy.redirected,
    };
  } catch (error) {
    log.debug("A read's answer is not kept for the render: its body did not arrive whole", error);
    return undefined;
  }
}

/**
 * An answer of its own for a call, made from a kept one.
 *
 * @param kept - The answer kept
 * @returns A fresh `Response`, its body unread
 * @example
 * ```ts
 * const response = replayAnswer(kept);
 * ```
 */
export function replayAnswer(kept: KeptAnswer): Response {
  const response = new Response(NULL_BODY.has(kept.status) ? null : kept.body.slice(0), {
    status: kept.status,
    statusText: kept.statusText,
    headers: kept.headers.map(([name, value]): [string, string] => [name, value]),
  });
  return Object.defineProperties(response, {
    url: { value: kept.url },
    redirected: { value: kept.redirected },
  });
}
