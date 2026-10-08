import type { JsonRpcRequest } from "../protocol/json-rpc";
import { META } from "../protocol/versions";

/* The requests whose `Mcp-Name` header carries what they name. */
const NAMED: Readonly<Record<string, "name" | "uri">> = {
  "tools/call": "name",
  "prompts/get": "name",
  "resources/read": "uri",
};
const SENTINEL = /^=\?base64\?(.*)\?=$/;

/**
 * Whether a 2026-07-28 request's headers say what its body says.
 *
 * Under that revision a request repeats its version, its method and the
 * name it calls in headers, for a gateway to route by without reading the
 * body. A body that says otherwise would reach one tool past a gateway that
 * let through another, so it is refused (`-32020`).
 *
 * @param request - The HTTP request's headers
 * @param message - The JSON-RPC request its body holds
 * @returns What does not match, or `undefined` when everything does
 * @example
 * ```ts
 * headerMismatch(request.headers, message); // "Mcp-Name header value 'a' does not match body value 'b'"
 * ```
 */
export function headerMismatch(headers: Headers, message: JsonRpcRequest): string | undefined {
  const meta = message.params._meta as Record<string, unknown>;
  const checks: Array<[string, unknown]> = [
    ["MCP-Protocol-Version", meta[META.protocolVersion]],
    ["Mcp-Method", message.method],
  ];
  const named = NAMED[message.method];
  if (named !== undefined) checks.push(["Mcp-Name", message.params[named]]);
  for (const [header, expected] of checks) {
    const sent = headers.get(header);
    if (sent === null) return `Header mismatch: the ${header} header is missing`;
    const value = decoded(sent);
    if (value !== String(expected)) {
      return `Header mismatch: ${header} header value '${value}' does not match body value '${String(expected)}'`;
    }
  }
  return undefined;
}

/* A value outside plain ASCII travels as `=?base64?…?=`; it is compared as it was before. */
function decoded(value: string): string | undefined {
  const match = SENTINEL.exec(value);
  if (match === null) return value;
  try {
    const binary = atob(match[1] ?? "");
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    );
  } catch {
    /* Not base64 at all: it matches no body value, which refuses the request. */
    return undefined;
  }
}
