/** RFC 6455 close codes that should NOT trigger reconnection */
const FATAL_CODES: ReadonlySet<number> = new Set([
  1000, // normal close
  1002, // protocol error
  1003, // unsupported data
  1007, // invalid frame payload
  1008, // policy violation
  1009, // message too big
]);

/**
 * Determine whether a WebSocket close code warrants automatic reconnection.
 *
 * @param code - WebSocket close code (RFC 6455)
 * @returns true if the connection should be retried
 *
 * @example
 * shouldReconnect(1006) // true — abnormal closure
 * shouldReconnect(1000) // false — normal close
 */
export function shouldReconnect(code: number): boolean {
  if (FATAL_CODES.has(code)) return false;

  // 4000-4099: custom fatal range (application-defined)
  if (code >= 4000 && code <= 4099) return false;

  return true;
}
