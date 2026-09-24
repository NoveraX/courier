/**
 * Read a TCP port the user supplied.
 *
 * `Number.parseInt` read `3001abc` as 3001 and took it; a port is digits and
 * nothing else. The message names where the value came from, so a bad
 * `studio.port` in the config is not reported as a bad flag.
 *
 * @param value - The port as written.
 * @param source - Where it was written, for the message.
 * @returns The port, or an Error describing why it is not one.
 */
export function parsePort(value: string, source: string): number | Error {
  const port = /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  if (Number.isInteger(port) && port >= 1 && port <= 65535) return port;
  return new Error(`Invalid ${source}: "${value}". A port is a whole number from 1 to 65535.`);
}
