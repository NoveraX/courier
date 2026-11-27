/**
 * Chunks of bytes laid end to end in one buffer.
 *
 * @param chunks - The chunks, in order
 * @returns Their bytes, one after another
 * @example
 * ```ts
 * joinedBytes([new Uint8Array([1, 2]), new Uint8Array([3])]); // → Uint8Array [1, 2, 3]
 * ```
 */
export function joinedBytes(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let size = 0;
  for (const chunk of chunks) size += chunk.byteLength;
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}
