import { isExposedToWire } from "../adapter/exposure";
import type { SchemaMetadata } from "../validation";

/** A call that arrived over the proxy, as far as deciding whether it may run. */
export interface WireCall {
  /** The source as it sits in the registry */
  dataSource: unknown;
  group: unknown;
  method: unknown;
  /** The endpoint's metadata, when it has any */
  schema: SchemaMetadata | undefined;
  /** Whether the caller asked for the upstream's body unread */
  stream: boolean | undefined;
  /** The HTTP method the call reached the proxy with */
  proxyMethod: "GET" | "POST";
  /** How an unknown name is answered, so a hidden one is answered alike */
  notFound: string;
}

/** Why a call may not run: the status and message it is answered with. */
export interface WireRefusal {
  status: number;
  message: string;
}

/**
 * Decide whether a call from a browser may run.
 *
 * A response schema decides what the caller may read — it strips the fields a
 * browser is not meant to see — so an endpoint that declares one is never
 * streamed to a browser: the stream is the upstream's body before the schema
 * has seen it. A server-side caller is not asked; it holds the credentials the
 * schema protects in any case.
 *
 * @param call - The call and the endpoint it names
 * @returns The refusal, or `undefined` when the call may run
 *
 * @example
 * ```ts
 * const refused = refuseWireCall({ dataSource, group, method, schema, stream, proxyMethod, notFound });
 * if (refused) return buildErrorResponse(context, refused.status, refused.message);
 * ```
 */
export function refuseWireCall(call: WireCall): WireRefusal | undefined {
  const group = typeof call.group === "string" ? call.group : undefined;
  /* Answered as an unknown name is: telling a caller that guessing names is
     forbidden confirms that the name it guessed exists. */
  if (!isExposedToWire(call.dataSource, group, String(call.method))) {
    return { status: 400, message: call.notFound };
  }
  if (call.proxyMethod === "GET" && call.schema?.type !== "query") {
    return { status: 405, message: "This endpoint does not support GET requests" };
  }
  if (call.stream && call.schema?.response) {
    return {
      status: 400,
      message: `[${String(call.method)}]: an endpoint with a response schema is not streamed through the proxy`,
    };
  }
  return undefined;
}
