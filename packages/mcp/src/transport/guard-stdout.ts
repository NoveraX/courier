/**
 * Keep the stdio connection's stream for the protocol alone.
 *
 * Over stdio, everything on stdout is read as an MCP message, so a line a
 * logger, a library or the application's own config prints there would
 * break the connection. From here on, whatever else writes to stdout —
 * `console.log` included — goes to stderr, which a client shows as the
 * server's log; the protocol writes through the writer this returns.
 *
 * @returns Writes one protocol line to the real stdout
 * @example
 * ```ts
 * const write = guardStdout();
 * write(JSON.stringify(response));
 * ```
 */
export function guardStdout(): (line: string) => void {
  const { stdout, stderr } = process;
  const original = stdout.write.bind(stdout);
  stdout.write = stderr.write.bind(stderr) as typeof stdout.write;
  return (line) => {
    original(`${line}\n`);
  };
}
