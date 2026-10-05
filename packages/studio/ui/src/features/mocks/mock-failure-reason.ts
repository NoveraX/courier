const ERROR_NAME = /^[A-Za-z]*Error:\s*/;
const PORT_TAKEN = /EADDRINUSE\b.*?:(\d+)\s*$/;

/**
 * The reason a mock server failed, as a sentence to show: the first line
 * of what it reported, without the error's name or the stack below it, and
 * a port another process holds said as such.
 *
 * @param lastError - What the mock server reported, a stack trace included
 * @returns The reason, one line
 *
 * @example
 * ```ts
 * mockFailureReason("Error: listen EADDRINUSE: address already in use 127.0.0.1:7501\n    at Server.setupListenHandle");
 * // → "Port 7501 is in use by another process"
 * ```
 */
export function mockFailureReason(lastError: string): string {
  const firstLine =
    lastError
      .split("\n")
      .find((line) => line.trim() !== "")
      ?.trim() ?? lastError.trim();
  const message = firstLine.replace(ERROR_NAME, "");
  const port = PORT_TAKEN.exec(message)?.[1];
  return port ? `Port ${port} is in use by another process` : message;
}
