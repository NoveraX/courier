/** Channels sent in one SUBSCRIBE or UNSUBSCRIBE, so a large set is no single huge command. */
const BATCH = 500;

/**
 * Cut channels into the batches one SUBSCRIBE or UNSUBSCRIBE sends.
 *
 * @param channels - The channels
 * @returns Them, 500 to a batch, in order
 * @example
 * ```ts
 * for (const batch of channelBatches(missing)) await subscriber.subscribe(...batch);
 * ```
 */
export function channelBatches(channels: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let start = 0; start < channels.length; start += BATCH) {
    out.push(channels.slice(start, start + BATCH));
  }
  return out;
}
