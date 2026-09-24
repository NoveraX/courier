/**
 * The byte order mark a file may start with. oxc counts it as offset 0, so
 * nothing may be inserted before it, and it is not indentation.
 *
 * @example
 * ```ts
 * text.startsWith(BYTE_ORDER_MARK) ? 1 : 0; // → where the file's code can start
 * ```
 */
export const BYTE_ORDER_MARK = "\uFEFF";
