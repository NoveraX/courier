/**
 * One character of whitespace between tokens: ECMAScript's WhiteSpace or
 * LineTerminator — tab, vertical tab, form feed, space, no-break space, the
 * BOM, every other space separator, LF, CR, U+2028 and U+2029 — which is
 * exactly what `\s` matches.
 *
 * @example
 * ```ts
 * WHITESPACE.test("\u2028"); // → true
 * ```
 */
export const WHITESPACE = /\s/;
