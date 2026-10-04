/** The symbols Courier's terminal output marks its lines with. */
export interface Glyphs {
  /** A debug line. */
  readonly debug: string;
  /** An info line. */
  readonly info: string;
  /** A warning, and a problem a banner restates. */
  readonly warn: string;
  /** An error. */
  readonly error: string;
  /** A banner row: an address, a file. */
  readonly arrow: string;
}

const UNICODE: Glyphs = { debug: "·", info: "●", warn: "▲", error: "✕", arrow: "➜" };
const ASCII: Glyphs = { debug: "-", info: "*", warn: "!", error: "x", arrow: ">" };

/**
 * The symbols to write, as the terminal can draw them.
 *
 * @param unicode - Whether the terminal draws Unicode symbols
 * @returns The Unicode set, or its ASCII stand-ins
 * @example
 * ```ts
 * const { warn } = glyphsFor(supportsUnicode());
 * ```
 */
export function glyphsFor(unicode: boolean): Glyphs {
  return unicode ? UNICODE : ASCII;
}
