/** The part of a Node, Bun or Deno output stream the colour decision reads. */
export interface OutputStream {
  readonly isTTY?: boolean;
  getColorDepth?(): number;
}

const FORCED_ON = new Set(["", "1", "2", "3", "true"]);

/**
 * Whether a line written to `stream` may carry colour.
 *
 * It mirrors the decision Node's console makes for the cause printed after
 * the line, so the prefix and the stack are coloured together or not at all:
 * `FORCE_COLOR` wins, then a non-empty `NO_COLOR` and `TERM=dumb` turn colour off, and
 * otherwise only a terminal that supports colour gets it — never a pipe or a
 * log file.
 *
 * @param stream - The stream the line goes to; absent on runtimes without `process`
 * @returns `true` when escape codes may be written
 */
export function shouldColorize(stream: OutputStream | undefined): boolean {
  const env = globalThis.process?.env;
  const forced = env?.FORCE_COLOR;
  if (forced !== undefined) return FORCED_ON.has(forced);
  /* An empty NO_COLOR counts as unset, as Node and no-color.org read it. */
  if ((env?.NO_COLOR ?? "") !== "" || env?.TERM === "dumb") return false;
  if (stream?.isTTY !== true) return false;
  return typeof stream.getColorDepth === "function" ? stream.getColorDepth() > 2 : true;
}
