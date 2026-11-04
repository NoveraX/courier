/**
 * How far {@link redact} reads a value. Past these a value is cut short, so
 * redacting costs a bounded amount whatever it is handed.
 */
export const REDACT_BOUNDS = {
  /** The longest text kept; four times as much is read, so a text of any size costs the same. */
  text: 8_192,
  /** How deep a value is read — an error's chain of causes, a body's nesting; deeper is `[…]`. */
  depth: 16,
  /** How many entries of one list or record are kept; the rest are counted. */
  width: 1_000,
} as const;

/** What stands where a value was cut: a loop back to itself, or a level past the deepest. */
export const CUT = "[…]";
