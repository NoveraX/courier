import { discardBody, isOriginAllowed, readBoundedBody } from "@noverax/courier/internal";

import { isRecord } from "../is-record";
import { ERROR_CODE } from "../protocol/json-rpc";
import type { McpServer } from "../protocol/mcp-server";
import { readMessage } from "../protocol/read-message";
import { META } from "../protocol/versions";
import { headerMismatch } from "./header-mismatch";
import { corsHeaders, refusal, rpcResponse } from "./http-responses";

/** What one HTTP exchange is answered from. */
export interface HttpEndpoint {
  readonly server: McpServer;
  /** Who is asking: a principal, `null` or `undefined` to turn the request away, or a response of its own. */
  readonly authorize: (request: Request) => unknown;
  readonly allowedOrigins?: readonly string[] | undefined;
  readonly maxBodyBytes: number;
}

/**
 * Answer one HTTP request to an MCP endpoint (Streamable HTTP, POST only).
 *
 * A browser's request from an origin the endpoint does not accept is
 * refused before anything else, as the protocol requires against DNS
 * rebinding; then the caller must be one `authorize` lets in. Each request
 * is answered with one JSON response, and keeps nothing for the next: a
 * client that opened with `initialize` names its revision in a header.
 *
 * @param request - The HTTP request
 * @param endpoint - The protocol server, and the rules around it
 * @returns The HTTP response
 * @example
 * ```ts
 * const response = await handleHttp(request, { server, authorize, maxBodyBytes: 1_048_576 });
 * ```
 */
export async function handleHttp(request: Request, endpoint: HttpEndpoint): Promise<Response> {
  if (!isOriginAllowed(request, endpoint.allowedOrigins)) {
    discardBody(request);
    return refusal(403, "Origin not allowed");
  }
  const cors = corsHeaders(request.headers.get("origin"));
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") {
    discardBody(request);
    return refusal(405, "This MCP endpoint takes POST", { ...cors, Allow: "POST, OPTIONS" });
  }
  const unfit = unfitHeaders(request.headers);
  if (unfit !== undefined) {
    discardBody(request);
    return refusal(unfit.status, unfit.message, cors);
  }
  const principal = await endpoint.authorize(request);
  if (principal instanceof Response) return principal;
  if (principal === null || principal === undefined) {
    discardBody(request);
    return refusal(401, "Unauthorized", { ...cors, "WWW-Authenticate": "Bearer" });
  }
  return answered(request, principal, endpoint, cors);
}

async function answered(
  request: Request,
  principal: unknown,
  endpoint: HttpEndpoint,
  cors: HeadersInit,
): Promise<Response> {
  const body = await readBoundedBody(request, endpoint.maxBodyBytes);
  if (!body.ok) return refusal(413, `A request is at most ${body.limit} bytes`, cors);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body.bytes));
  } catch {
    return refusal(400, "Parse error: the body is one JSON-RPC message", cors, ERROR_CODE.parse);
  }
  const incoming = readMessage(value);
  if (incoming.kind === "invalid")
    return Response.json(incoming.response, { status: 400, headers: cors });
  if (incoming.kind !== "request") return new Response(null, { status: 202, headers: cors });

  const { message } = incoming;
  const modern =
    isRecord(message.params._meta) && message.params._meta[META.protocolVersion] !== undefined;
  const mismatch = modern ? headerMismatch(request.headers, message) : undefined;
  if (mismatch !== undefined) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: ERROR_CODE.headerMismatch, message: mismatch },
      },
      { status: 400, headers: cors },
    );
  }
  const headerVersion = request.headers.get("mcp-protocol-version") ?? undefined;
  const connection = { transport: "http" as const, headerVersion, principal };
  const response = await endpoint.server.request(message, connection, request.signal);
  if (response === undefined) return new Response(null, { status: 204, headers: cors });
  return rpcResponse(response, modern, cors);
}

/* A body that is not JSON, or a client that takes no JSON back, is refused before anything runs. */
function unfitHeaders(headers: Headers): { status: number; message: string } | undefined {
  const type = headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json")
    return { status: 415, message: "A request's body is application/json" };
  const accept = headers.get("accept");
  if (accept !== null && !/application\/json|application\/\*|\*\/\*/i.test(accept)) {
    return { status: 406, message: "This endpoint answers with application/json" };
  }
  return undefined;
}
