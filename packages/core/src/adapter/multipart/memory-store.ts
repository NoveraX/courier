import type { FileStore } from "./file-store";
import type { MultipartPart } from "./multipart-parts";

/** How large the slabs a file is gathered in may grow: a slab first, then twice that and on to this. */
const MAX_SLAB_BYTES = 1_048_576;

/**
 * Keep each uploaded file in memory, as one copy of its bytes.
 *
 * A file is gathered in slabs, the small pieces the network delivers joined
 * into them, and each full slab becomes a `Blob`: a `File` made of those
 * takes their bytes without copying them again, where one made of the
 * pieces themselves would hold every piece and then a copy of them all —
 * twice the file — before the pieces could go. The slabs start at
 * `slabBytes` and double up to 1 MB, so a small file costs a small slab and
 * a large one few `Blob`s: one made of thousands is slow to read. A piece as
 * large as the slab becomes a `Blob` of its own.
 *
 * @param slabBytes - The size of a file's first slab
 * @returns The store
 *
 * @example
 * ```ts
 * const form = await readForm(parts, limits, memoryStore(65_536));
 * ```
 */
export function memoryStore(slabBytes: number): FileStore {
  return { file: (part) => gathered(part, slabBytes) };
}

async function gathered(part: MultipartPart, slabBytes: number): Promise<File> {
  const blobs: Blob[] = [];
  let slab = new Uint8Array(slabBytes);
  let filled = 0;
  const flush = (): void => {
    if (filled === 0) return;
    /* A Blob takes a copy of the bytes it is made from, so the slab is free again. */
    blobs.push(new Blob([slab.subarray(0, filled)]));
    filled = 0;
    if (slab.byteLength < MAX_SLAB_BYTES) slab = new Uint8Array(slab.byteLength * 2);
  };
  for await (const piece of part.body) {
    if (piece.byteLength >= slab.byteLength) {
      flush();
      blobs.push(new Blob([piece]));
      continue;
    }
    if (filled + piece.byteLength > slab.byteLength) flush();
    slab.set(piece, filled);
    filled += piece.byteLength;
  }
  flush();
  /* A file sent with no type is plain text (RFC 7578 §4.4), as the platform reads it. */
  return new File(blobs, part.filename ?? "", { type: part.type ?? "text/plain" });
}
