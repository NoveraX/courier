/** The frames a connection sent and its client has not acknowledged yet, in order. */
export interface KeptFrames {
  /** Their bytes together: the connection's `bufferedAmount` */
  readonly bytes: number;
  readonly size: number;
  /** Keep a frame sent, with its sequence number */
  keep(seq: number, bytes: Uint8Array): void;
  /** Let go of every frame up to `ack`, which the client has taken */
  acknowledge(ack: number): void;
  /** Each frame kept, in order */
  each(write: (bytes: Uint8Array) => void): void;
  clear(): void;
}

/**
 * What a connection over HTTP keeps of its frames until its client says it
 * took them, so an answer lost on the way is sent again.
 *
 * @returns The frames kept, none yet
 * @example
 * ```ts
 * const kept = createKeptFrames();
 * kept.keep(1, bytes);
 * kept.acknowledge(1);
 * kept.size; // 0
 * ```
 */
export function createKeptFrames(): KeptFrames {
  const frames: { readonly seq: number; readonly bytes: Uint8Array }[] = [];
  let bytes = 0;
  return {
    get bytes() {
      return bytes;
    },
    get size() {
      return frames.length;
    },
    keep(seq, frame) {
      frames.push({ seq, bytes: frame });
      bytes += frame.byteLength;
    },
    acknowledge(ack) {
      let taken = 0;
      for (const frame of frames) {
        if (frame.seq > ack) break;
        bytes -= frame.bytes.byteLength;
        taken++;
      }
      if (taken > 0) frames.splice(0, taken);
    },
    each(write) {
      for (const frame of frames) write(frame.bytes);
    },
    clear() {
      frames.length = 0;
      bytes = 0;
    },
  };
}
