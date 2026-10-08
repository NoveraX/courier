/** What a JSON-RPC message is identified by: MCP takes a string or a number, never `null`. */
export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface JsonRpcNotification {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface JsonRpcErrorBody {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface JsonRpcResult {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly result: Record<string, unknown>;
}

export interface JsonRpcError {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId | null;
  readonly error: JsonRpcErrorBody;
}

export type JsonRpcResponse = JsonRpcResult | JsonRpcError;

/** The JSON-RPC codes, and the ones MCP reserves for itself. */
export const ERROR_CODE = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  headerMismatch: -32020,
  missingCapability: -32021,
  unsupportedVersion: -32022,
} as const;

/**
 * A result answering a request.
 *
 * @param id - The request's id
 * @param result - What it answers with
 * @returns The response
 * @example
 * ```ts
 * resultOf(1, { tools: [] });
 * ```
 */
export function resultOf(id: JsonRpcId, result: Record<string, unknown>): JsonRpcResult {
  return { jsonrpc: "2.0", id, result };
}

/**
 * An error answering a request, or one whose id could not be read.
 *
 * @param id - The request's id, `null` when it had none that could be read
 * @param code - What went wrong, from `ERROR_CODE`
 * @param message - The sentence a client shows
 * @param data - What a client reads to recover, when there is any
 * @returns The response
 * @example
 * ```ts
 * errorOf(1, ERROR_CODE.methodNotFound, "Method not found: ping");
 * ```
 */
export function errorOf(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined && { data }) } };
}
