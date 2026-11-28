/**
 * Bytes as a request body, a Blob and a form take them: a view over memory
 * of its own as it stands, without a copy, and a view over shared memory
 * copied out, as a browser takes none.
 *
 * @param view - The bytes
 * @returns The same view, or its bytes in memory of their own
 * @example
 * ```ts
 * ownedBytes(new Uint8Array([1, 2])); // → the same Uint8Array
 * ownedBytes(new Uint8Array(new SharedArrayBuffer(2))); // → a copy of its 2 bytes
 * ```
 */
export function ownedBytes(view: ArrayBufferView): ArrayBufferView<ArrayBuffer> {
  if (isOwned(view)) return view;
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
}

function isOwned(view: ArrayBufferView): view is ArrayBufferView<ArrayBuffer> {
  return view.buffer instanceof ArrayBuffer;
}
