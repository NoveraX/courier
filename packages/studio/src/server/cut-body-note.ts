/**
 * What an export says of a body Studio kept only a part of: the part is
 * what was logged, and the whole was larger.
 *
 * @param bytes - The whole body's size in bytes
 * @returns The note
 * @example
 * ```ts
 * cutBodyNote(3_821_455); // "Studio kept a part of this body, too large for its log: the whole was 3,821,455 bytes."
 * ```
 */
export function cutBodyNote(bytes: number): string {
  return `Studio kept a part of this body, too large for its log: the whole was ${bytes.toLocaleString("en-US")} bytes.`;
}
