/** How large the slabs a file is gathered in may grow: the first one, then twice that and on to this. */
const MAX_SLAB_BYTES = 1_048_576;

/**
 * A file being gathered in memory as its pieces arrive, kept as one copy of
 * its bytes.
 *
 * The small pieces the network delivers are joined into slabs, and each
 * full slab becomes a `Blob`: a `File` made of those takes their bytes
 * without copying them again, where one made of the pieces themselves would
 * hold every piece and then a copy of them all — twice the file — before
 * the pieces could go. The slabs start at `slabBytes` and double up to 1 MB,
 * so a small file costs a small slab and a large one few `Blob`s: a `File`
 * made of thousands is slow to read. A piece as large as the slab becomes a
 * `Blob` of its own.
 *
 * @example
 * ```ts
 * const gathered = new GatheredFile(65_536);
 * for await (const piece of part.body) gathered.add(piece);
 * const file = gathered.file("a.png", "image/png");
 * ```
 */
export class GatheredFile {
  readonly #blobs: Blob[] = [];
  #slab: Uint8Array<ArrayBuffer>;
  #filled = 0;
  #size = 0;

  /** @param slabBytes - The size of the file's first slab */
  constructor(slabBytes: number) {
    this.#slab = new Uint8Array(slabBytes);
  }

  /** How many bytes the file holds so far. */
  get size(): number {
    return this.#size;
  }

  /** Take the next piece of the file. */
  add(piece: Uint8Array<ArrayBuffer>): void {
    this.#size += piece.byteLength;
    if (piece.byteLength >= this.#slab.byteLength) {
      this.#flush();
      this.#blobs.push(new Blob([piece]));
      return;
    }
    if (this.#filled + piece.byteLength > this.#slab.byteLength) this.#flush();
    this.#slab.set(piece, this.#filled);
    this.#filled += piece.byteLength;
  }

  /** The bytes gathered so far, in order, as `Blob`s; nothing is held back. */
  blobs(): Blob[] {
    this.#flush();
    return [...this.#blobs];
  }

  /**
   * The file the pieces make.
   *
   * @param name - Its name
   * @param type - Its media type, `text/plain` when the part named none (RFC 7578 §4.4)
   * @returns The file
   */
  file(name: string, type: string | undefined): File {
    return new File(this.blobs(), name, { type: type ?? "text/plain" });
  }

  #flush(): void {
    if (this.#filled === 0) return;
    /* A Blob takes a copy of the bytes it is made from, so the slab is free again. */
    this.#blobs.push(new Blob([this.#slab.subarray(0, this.#filled)]));
    this.#filled = 0;
    if (this.#slab.byteLength < MAX_SLAB_BYTES) {
      this.#slab = new Uint8Array(this.#slab.byteLength * 2);
    }
  }
}
