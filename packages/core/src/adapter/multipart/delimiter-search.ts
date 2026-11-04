const CR = 0x0d;

/**
 * Finds a multipart body's delimiter, `CRLF--boundary`, in a body that
 * arrives in chunks — Boyer–Moore–Horspool, carried across the chunks' joins.
 *
 * The bytes between delimiters are handed out as views of the chunks they
 * arrived in, never copied, apart from the few that a chunk's end left in
 * doubt. A window is tried on its last byte first, then on its first, `CR`,
 * then on the rest from the left. A boundary cannot hold `CR` (RFC 2046), so
 * the needle holds it once, at its start: two windows that both match a long
 * prefix cannot overlap, and the search stays linear in the body however
 * the boundary and the data are chosen to defeat it.
 *
 * A chunk's last bytes that may begin the delimiter are kept as a count:
 * being a prefix of the needle, they are the needle's own first bytes. Since
 * only `CR` begins the needle, bytes kept in doubt that the next chunk does
 * not complete are data, all of them.
 */
export class DelimiterSearch {
  readonly #needle: Uint8Array<ArrayBuffer>;
  readonly #skip = new Uint8Array(256);
  /* How many of the needle's first bytes the data so far ends with. */
  #kept: number;

  /**
   * @param boundary - The body's boundary, 1 to 70 characters of RFC 2046
   * @param atStart - Whether the body starts here, where a delimiter needs
   *   no line break before it: the first one may open the body
   */
  constructor(boundary: string, atStart: boolean) {
    this.#needle = new TextEncoder().encode(`\r\n--${boundary}`);
    const last = this.#needle.length - 1;
    this.#skip.fill(this.#needle.length);
    for (let at = 0; at < last; at++) this.#skip[this.#needle[at] ?? 0] = last - at;
    this.#kept = atStart ? 2 : 0;
  }

  /**
   * Look for the delimiter in `chunk` from `start`, handing on the data before it.
   *
   * @param chunk - The chunk
   * @param start - Where in it the search starts
   * @param data - Takes each piece of data, in order
   * @returns The offset just past the delimiter, or -1 when the chunk holds
   *   no end to it: its data handed on, but for the bytes kept in doubt
   */
  find(
    chunk: Uint8Array<ArrayBuffer>,
    start: number,
    data: (piece: Uint8Array<ArrayBuffer>) => void,
  ): number {
    const needle = this.#needle;
    if (this.#kept > 0) {
      const rest = needle.length - this.#kept;
      const seen = Math.min(rest, chunk.length - start);
      if (equals(chunk, start, needle, this.#kept, seen)) {
        if (seen === rest) {
          this.#kept = 0;
          return start + rest;
        }
        this.#kept += seen;
        return -1;
      }
      data(needle.subarray(0, this.#kept));
      this.#kept = 0;
    }

    const last = needle.length - 1;
    const lastByte = needle[last];
    for (let at = start; at + last < chunk.length; ) {
      const byte = chunk[at + last] ?? 0;
      if (byte === lastByte && chunk[at] === CR && equals(chunk, at + 1, needle, 1, last - 1)) {
        if (at > start) data(chunk.subarray(start, at));
        return at + needle.length;
      }
      at += this.#skip[byte] ?? needle.length;
    }

    /* A window the chunk cannot fill may still be the delimiter's start. */
    for (let at = chunk.indexOf(CR, Math.max(start, chunk.length - last)); at !== -1; ) {
      if (equals(chunk, at, needle, 0, chunk.length - at)) {
        if (at > start) data(chunk.subarray(start, at));
        this.#kept = chunk.length - at;
        return -1;
      }
      at = chunk.indexOf(CR, at + 1);
    }
    if (chunk.length > start) data(chunk.subarray(start));
    return -1;
  }
}

/** Whether `length` bytes of `chunk` from `at` are the needle's from `from`. */
function equals(
  chunk: Uint8Array,
  at: number,
  needle: Uint8Array,
  from: number,
  length: number,
): boolean {
  for (let offset = 0; offset < length; offset++) {
    if (chunk[at + offset] !== needle[from + offset]) return false;
  }
  return true;
}
