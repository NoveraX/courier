import type { AnySource, Sources } from "../define/types";
import { withVariableDefaults } from "../define/variable-defaults";
import type { CallOptions, Context } from "../http-client/types";
import type { CallPurpose } from "../middleware/types";
import { resolveEndpoint } from "./execute-resolve";
import { buildErrorResponse } from "./execute-response";

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
  /** The verb the endpoint was addressed with, as HTTP spells it */
  httpMethod: Resolved["httpMethod"];
  /** What the call is, when it is a request the session makes rather than an endpoint's */
  purpose?: CallPurpose | undefined;
}

/** The target of a call, or the answer that refuses it. */
export type CallResolution = { target: CallTarget } | { refusal: unknown };

/** A call whose endpoint was found, as a rule of where it came from reads it. */
export interface ResolvedCall {
  /** The source as it sits in the registry */
  dataSource: unknown;
  group: unknown;
  method: unknown;
  /** The endpoint's metadata, when it has any */
  schema: CallTarget["schema"];
  /** The call's options, as its payload gave them */
  options: CallRequest["options"];
  /** The endpoint's own options */
  endpointOptions: CallTarget["endpointOptions"];
  /** The endpoint as a refusal names it, `[api][admin][purge]` */
  endpoint: string;
}

/**
 * Why a call may not run where it came from — the status and message it is
 * answered with — or `undefined` when it may: the proxy's rules for a
 * browser's call, which the proxy hands its calls.
 */
export type CallRefusal = (call: ResolvedCall) => { status: number; message: string } | undefined;

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
 * @param refuse - What refuses a found call where it came from, when anything does
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
  refuse?: CallRefusal,
): CallResolution {
  const { source, group, method, variables, options } = call;
  const refused = (status: number, message: string): CallResolution => ({
    refusal: buildErrorResponse(context, status, message),
  });
  /* A request that leaves a name out is malformed, not a guess at one. */
  if (typeof source !== "string" || source === "") {
    return refused(400, "[source] is required: the call names no source");
  }
  if (typeof method !== "string" || method === "") {
    return refused(400, "[method] is required: the call names no endpoint");
  }
  const dataSource = Object.hasOwn(sources, source) ? sources[source] : undefined;

  const methodPath = group ? `[${String(group)}][${method}]` : `[${method}]`;
  const named = `[${source}]${methodPath}`;
  const notFound = `${named}: method not found`;

  if (!dataSource) {
    const fromWire = context?.proxyMethod !== undefined;
    return refused(400, fromWire ? notFound : `[${source}]: source not found`);
  }
  if (variables !== undefined && variables !== null && !SENDABLE.has(typeof variables)) {
    return refused(400, "[variables] must be a JSON value or a request body");
  }

  const {
    endpoint,
    endpointGroup,
    schema,
    options: endpointOptions,
    httpMethod,
  } = resolveEndpoint(dataSource, group, method);
  if (typeof endpoint !== "function") return refused(400, notFound);

  /* Asked before the transport is: a stream the rule hides is unknown, not "served over SSE". */
  const ruled = refuse?.({
    dataSource,
    group,
    method,
    schema,
    options,
    endpointOptions,
    endpoint: named,
  });
  if (ruled) return refused(ruled.status, ruled.message);

  /* A stream or a channel is reached by opening one, not by asking for it
     over HTTP. Without this an ordinary POST ran a channel's implementation
     factory, which expects a socket to talk to and has none. */
  if (schema?.transport && schema.transport !== "http") {
    return refused(
      400,
      `[${String(method)}]: endpoint is served over ${schema.transport}, not HTTP`,
    );
  }

  const target = {
    ...call,
    variables: withVariableDefaults(schema?.defaults, call.variables),
    dataSource,
    endpoint,
    endpointGroup,
    schema,
    endpointOptions,
    httpMethod,
  };
  return { target };
}
