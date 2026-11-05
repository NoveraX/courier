/** The longest epoch a position names, in characters. */
const MAX_EPOCH_LENGTH = 64;

/** A position a client counted: the last number of a topic's sequence, and its epoch. */
export interface ResumePosition {
  readonly seq: number;
  readonly epoch: string;
}

/**
 * Read the position a subscription asks to resume from, as `since` sends
 * it, or nothing for one that is no position — which resumes nothing, and
 * refuses nothing: the subscription is made all the same.
 *
 * @param since - What the client sent
 * @returns The position, or undefined
 * @example
 * ```ts
 * resumableFrom({ seq: 41, epoch: "k2m9x" }); // { seq: 41, epoch: "k2m9x" }
 * resumableFrom("from the start"); // undefined
 * ```
 */
export function resumableFrom(since: unknown): ResumePosition | undefined {
  if (typeof since !== "object" || since === null) return undefined;
  const { seq, epoch } = since as Record<string, unknown>;
  if (!Number.isSafeInteger(seq) || (seq as number) < 0) return undefined;
  if (typeof epoch !== "string" || epoch.length === 0 || epoch.length > MAX_EPOCH_LENGTH)
    return undefined;
  return { seq: seq as number, epoch };
}
