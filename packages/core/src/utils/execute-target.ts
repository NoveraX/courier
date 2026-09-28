import type { AnySource, Sources } from "../define/types";
import type { CallOptions, Context } from "../http-client/types";
import { resolveEndpoint } from "./execute-resolve";
import { buildErrorResponse } from "./execute-response";
import { refuseWireCall } from "./wire-refusal";

/**
 * What variables may be: named values, a list, a JSON scalar, form data or a
 * raw body. A function, a symbol or a bigint has no form on the wire.
 */
const SENDABLE: ReadonlySet<string> = new Set(["object", "string", "number", "boolean"]);

type Resolved = ReturnType<typeof resolveEndpoint>;

/** A call, as its payload names it, with its options already accepted. */
export interface CallRequest {
  source: unknown;
  group: unknown;
  method: unknown;
  variables: unknown;
  options: CallOptions<boolean> | undefined;
}

/** A call, and the source and the endpoint it resolved to. */
export interface CallTarget extends CallRequest {
  dataSource: AnySource;
  endpoint: NonNullable<Resolved["endpoint"]>;
  endpointGroup: Resolved["endpointGroup"];
  schema: Resolved["schema"];
  endpointOptions: Resolved["options"];
}

/** The target of a call, or the answer that refuses it. */
export type CallResolution = { target: CallTarget } | { refusal: unknown };

/**
 * Find the source and the endpoint a call names, or refuse it.
 *
 * A name that resolves to nothing is answered the same way whether the
 * source or the method is the missing half when the call came over the
 * proxy: saying which lets a caller enumerate the registry, and the sources
 * worth finding that way are exactly the ones `expose: false` was meant to
 * hide. A server-side caller is not guessing, so it keeps the message that
 * names the real mistake.
 *
 * @param sources - The registered sources
 * @param call - The call, as its payload names it
 * @param context - The call's context, when it has one
 * @returns The target, or the error answer the call gets instead
 *
 * @example
 * ```ts
 * const resolution = resolveCallTarget(sources, { source: "api", group: "users",
 *   method: "list", variables: undefined, options: undefined });
 * if ("refusal" in resolution) return resolution.refusal;
 * ```
 */
export function resolveCallTarget(
  sources: Sources,
  call: CallRequest,
  context?: Context,
): CallResolution {
  const { source, group, method, variables, options } = call;
  const dataSource =
    typeof source === "string" && Object.hasOwn(sources, source) ? sources[source] : undefined;

  const methodPath = group ? `[${String(group)}][${String(method)}]` : `[${String(method)}]`;
  const notFound = `[${String(source)}]${methodPath}: method not found`;
  const refuse = (status: number, message: string): CallResolution => ({
    refusal: buildErrorResponse(context, status, message),
  });

  if (!dataSource) {
    const fromWire = context?.proxyMethod !== undefined;
    return refuse(400, fromWire ? notFound : `[${String(source)}]: source not found`);
  }
  if (variables !== undefined && variables !== null && !SENDABLE.has(typeof variables)) {
    return refuse(400, "[variables] must be a JSON value or a request body");
  }

  const {
    endpoint,
    endpointGroup,
    schema,
    options: endpointOptions,
  } = resolveEndpoint(dataSource, group, method);
  if (typeof endpoint !== "function") return refuse(400, notFound);

  if (context?.proxyMethod !== undefined) {
    const refused = refuseWireCall({
      dataSource,
      group,
      method,
      schema,
      stream: options?.stream,
      proxyMethod: context.proxyMethod,
      notFound,
    });
    if (refused) return refuse(refused.status, refused.message);
  }

  /* A stream or a channel is reached by opening one, not by asking for it
     over HTTP. Without this an ordinary POST ran a channel's implementation
     factory, which expects a socket to talk to and has none. */
  if (schema?.transport && schema.transport !== "http") {
    return refuse(
      400,
      `[${String(method)}]: endpoint is served over ${schema.transport}, not HTTP`,
    );
  }

  const target = { ...call, dataSource, endpoint, endpointGroup, schema, endpointOptions };
  return { target };
}
