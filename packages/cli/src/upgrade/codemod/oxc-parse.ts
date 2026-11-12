import { type ParseResult, type ParserOptions, parseSync, rawTransferSupported } from "oxc-parser";

/* Whether the system refused the memory oxc shares with JavaScript: from then on every tree comes as JSON. */
let refused = false;

/**
 * Parse a piece of code with oxc, as the upgrade parses each file. The
 * tree comes through the memory oxc shares with JavaScript — the same
 * tree as JSON gives, at about a sixth of the cost — where oxc supports
 * that and the system only reserves the memory until it is written:
 * Linux and macOS. Windows commits all 6 GiB of it to each process that
 * parses, and a few such processes at once could use up what it can
 * commit, so there the tree comes as JSON. So it does everywhere once
 * the system has refused that memory.
 *
 * @param filename - The name oxc reads the language from
 * @param text - The code
 * @param options - oxc's options
 * @returns oxc's result
 * @example
 * ```ts
 * parseCode("piece.ts", "export const a = 1;").module.staticExports.length; // 1
 * ```
 */
export function parseCode(filename: string, text: string, options?: ParserOptions): ParseResult {
  if (!refused && process.platform !== "win32" && rawTransferSupported()) {
    const shared: ParserOptions & { readonly experimentalRawTransfer: true } = {
      ...options,
      experimentalRawTransfer: true,
    };
    try {
      return parseSync(filename, text, shared);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      refused = true;
    }
  }
  return parseSync(filename, text, options);
}
