/** The part of a Node, Bun or Deno output stream the colour decision reads. */
export interface OutputStream {
  readonly isTTY?: boolean;
  getColorDepth?(): number;
}

/**
 * How many colours a stream shows: none, the 16 of the terminal's theme, 256,
 * or 24-bit.
 */
export type ColorLevel = 0 | 4 | 8 | 24;

/* FORCE_COLOR's values as Node reads them; any other value turns colour off. */
const FORCED = new Map<string, ColorLevel>([
  ["", 4],
  ["1", 4],
  ["true", 4],
  ["2", 8],
  ["3", 24],
]);

/**
 * How many colours a line written to `stream` may use.
 *
 * It mirrors the decision Node's console makes for the error printed after a
 * log line, so a line and its stack are coloured together or not at all:
 * `FORCE_COLOR` wins, then a non-empty `NO_COLOR` and `TERM=dumb` turn colour
 * off, and otherwise only a terminal gets colour — never a pipe or a log
 * file — as many as it reports. A forced level is raised to 24-bit where
 * `COLORTERM` says the terminal behind the pipe shows it, as it does when a
 * task runner relays a dev server's output.
 *
 * @param stream - The stream the line goes to; absent on runtimes without `process`
 * @returns The colour level, `0` when no escape code may be written
 * @example
 * ```ts
 * if (colorLevel(process.stdout) === 24) console.log("24-bit colour");
 * ```
 */
export function colorLevel(stream: OutputStream | undefined): ColorLevel {
  const env = globalThis.process?.env;
  const forced = env?.FORCE_COLOR;
  if (forced !== undefined) {
    const level = FORCED.get(forced) ?? 0;
    const truecolor = env?.COLORTERM === "truecolor" || env?.COLORTERM === "24bit";
    return level > 0 && truecolor ? 24 : level;
  }
  /* An empty NO_COLOR counts as unset, as Node and no-color.org read it. */
  if ((env?.NO_COLOR ?? "") !== "" || env?.TERM === "dumb") return 0;
  if (stream?.isTTY !== true) return 0;
  const depth = typeof stream.getColorDepth === "function" ? stream.getColorDepth() : 4;
  if (depth >= 24) return 24;
  if (depth >= 8) return 8;
  return depth >= 4 ? 4 : 0;
}
