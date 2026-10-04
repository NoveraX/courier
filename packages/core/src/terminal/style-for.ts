import type { OutputStream } from "./color-level";
import { colorLevel } from "./color-level";
import { supportsUnicode } from "./supports-unicode";
import type { TerminalStyle } from "./terminal-style";
import { createTerminalStyle } from "./terminal-style";

/**
 * The style for text written to a stream: as many colours as it shows, and
 * the symbols its terminal draws.
 *
 * @param stream - Where the text goes; absent on runtimes without `process`
 * @returns The style
 * @example
 * ```ts
 * const { bold, brand } = styleFor(process.stdout);
 * console.log(bold(brand("Courier Studio")));
 * ```
 */
export function styleFor(stream: OutputStream | undefined): TerminalStyle {
  return createTerminalStyle(colorLevel(stream), supportsUnicode());
}
