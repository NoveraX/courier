import { CourierError } from "@noverax/courier";

/**
 * A request the protocol itself refuses — an unknown method, a missing
 * field, a revision this server does not speak — answered as a JSON-RPC
 * error rather than as a tool's result.
 *
 * @example
 * ```ts
 * throw new McpProtocolError(ERROR_CODE.methodNotFound, "Method not found: ping");
 * ```
 */
export class McpProtocolError extends CourierError<number> {
  /** What a client reads to recover: the versions this server speaks, the capability it needs. */
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message, { code });
    this.name = "McpProtocolError";
    this.data = data;
  }
}
