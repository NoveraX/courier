import { isRecord } from "../is-record";
import {
  ERROR_CODE,
  errorOf,
  type JsonRpcError,
  type JsonRpcId,
  type JsonRpcNotification,
  type JsonRpcRequest,
} from "./json-rpc";

/** A message read off the wire, sorted by what it is. */
export type Incoming =
  | { readonly kind: "request"; readonly message: JsonRpcRequest }
  | { readonly kind: "notification"; readonly message: JsonRpcNotification }
  | {
      readonly kind: "response";
      readonly id: JsonRpcId;
      readonly result?: unknown;
      readonly error?: unknown;
    }
  | { readonly kind: "invalid"; readonly response: JsonRpcError };

/**
 * Sort one parsed JSON value into the message it is.
 *
 * A response only reaches a server answering a request it sent itself — a
 * confirmation it asked a client for. A batch is refused: MCP has not taken
 * them since 2025-06-18.
 *
 * @param value - The parsed JSON of one message
 * @returns The message, or the error answering one that is none
 * @example
 * ```ts
 * readMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }); // { kind: "request", … }
 * ```
 */
export function readMessage(value: unknown): Incoming {
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    return invalid(
      null,
      Array.isArray(value) ? "Batches are not supported" : "Not a JSON-RPC 2.0 message",
    );
  }
  const id = isId(value.id) ? value.id : undefined;
  if (typeof value.method !== "string") {
    if (id !== undefined && ("result" in value || "error" in value)) {
      return { kind: "response", id, result: value.result, error: value.error };
    }
    return invalid(id ?? null, "A request names its method");
  }
  if (value.params !== undefined && !isRecord(value.params)) {
    return invalid(id ?? null, "A message's params are an object");
  }
  const params = (value.params ?? {}) as Record<string, unknown>;
  if ("id" in value && id === undefined)
    return invalid(null, "A request's id is a string or a number");
  if (id === undefined)
    return { kind: "notification", message: { jsonrpc: "2.0", method: value.method, params } };
  return { kind: "request", message: { jsonrpc: "2.0", id, method: value.method, params } };
}

function invalid(id: JsonRpcId | null, message: string): Incoming {
  return { kind: "invalid", response: errorOf(id, ERROR_CODE.invalidRequest, message) };
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}
