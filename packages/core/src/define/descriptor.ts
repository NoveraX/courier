import type { HttpMethod } from "../http-client/types";
import type { SchemaMetadata, Transport } from "../validation";
import { ENDPOINT_SCHEMA } from "../validation";
import type { BuilderState } from "./builder";
import { resolveOptions } from "./builder";
import type { EndpointKind } from "./marker";
import type { AnyEndpointOptions } from "./options";
import type { AnyProbe } from "./probe";

const TRANSPORT_BY_KIND: Record<EndpointKind, Transport> = {
  query: "http",
  mutation: "http",
  stream: "sse",
  channel: "ws",
};

/**
 * Build the metadata stamped on a descriptor.
 *
 * Kept in the shape every consumer already reads, so the mock generator, the
 * studio codegen and the request executor need no knowledge of how an endpoint
 * was authored. The channel send slot is recorded as `receive` because that
 * field names the same messages from the server's side.
 */
export function resolveSchemas(state: BuilderState): SchemaMetadata {
  const { response, variables, send } = state.schemas;
  const transport = TRANSPORT_BY_KIND[state.kind];
  return {
    ...(response !== undefined && { response }),
    ...(variables !== undefined && { variables }),
    ...(send !== undefined && { receive: send }),
    /* Declaring the slot is what makes a channel bidirectional; a schema on it
       only decides whether inbound messages are validated. */
    ...(state.filled.includes("send") && { bidirectional: true as const }),
    ...((state.kind === "query" || state.kind === "mutation") && { type: state.kind }),
    ...(transport !== "http" && { transport }),
    ...(state.cache !== undefined && { cache: state.cache }),
  };
}

/**
 * Produce the descriptor for an endpoint whose implementation lives here.
 *
 * A stream or channel is served by the process that defines it, so the
 * function it carries produces events rather than addressing a remote one.
 * Its location comes from the group prefix and the endpoint name, so there is
 * no wire shape to probe.
 */
export function sealHandler(
  state: BuilderState,
  handler: AnyProbe,
  options: AnyEndpointOptions,
): Record<string | symbol, unknown> {
  return {
    [ENDPOINT_SCHEMA]: resolveSchemas(state),
    kind: state.kind,
    method: "get" as const,
    path: "",
    probe: handler,
    served: true,
    options: resolveOptions(state, options),
  };
}

/**
 * Produce the descriptor a verb terminal returns.
 *
 * The verb and the path are given rather than discovered, so nothing is probed
 * and the closure that carries out the call is synthesised from them.
 */
export function sealAt(
  state: BuilderState,
  wire: { method: HttpMethod; path: string; probe: AnyProbe; served: boolean },
  options: AnyEndpointOptions,
): Record<string | symbol, unknown> {
  return {
    [ENDPOINT_SCHEMA]: resolveSchemas(state),
    kind: state.kind,
    method: wire.method,
    path: wire.path,
    probe: wire.probe,
    served: wire.served,
    options: resolveOptions(state, options),
  };
}

/**
 * Which kind an endpoint addressed this way is.
 *
 * A stream or a channel is its own kind whatever the verb underneath. An HTTP
 * endpoint reads when its verb reads; `.reads()` says so for the rest.
 */
export function kindFor(head: EndpointKind, method: HttpMethod): EndpointKind {
  if (head !== "query" && head !== "mutation") return head;
  return READING_METHODS.has(method) ? "query" : "mutation";
}

const READING_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>(["get", "head", "options"]);
